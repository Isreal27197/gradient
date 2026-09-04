/**
 * GPA / CGPA calculation + academic intelligence engine.
 *
 * Every function here is pure: it takes plain data and returns plain data.
 * That keeps the maths independent of the database, trivially testable, and
 * reusable by the what-if simulator, the dashboard and the PDF transcript
 * without any duplicated logic.
 */

/** Build a fast lookup { letter -> { points, isPass } } from grade_points rows. */
export function buildScaleMap(gradePoints) {
  const map = new Map();
  for (const g of gradePoints) {
    map.set(String(g.letter).toUpperCase(), {
      points: Number(g.points),
      isPass: !!g.is_pass,
      minScore: g.min_score,
      maxScore: g.max_score,
    });
  }
  return map;
}

/** A course counts toward GPA only when it is completed and carries a known grade. */
export function isGraded(course, scaleMap) {
  return (
    course.status === 'completed' &&
    course.grade != null &&
    scaleMap.has(String(course.grade).toUpperCase())
  );
}

export function gradeInfo(course, scaleMap) {
  return scaleMap.get(String(course.grade || '').toUpperCase()) || null;
}

/** Quality points + units for an arbitrary list of courses. */
export function aggregate(courses, scaleMap) {
  let units = 0;
  let qualityPoints = 0;
  let gradedCount = 0;
  for (const c of courses) {
    if (!isGraded(c, scaleMap)) continue;
    const info = gradeInfo(c, scaleMap);
    units += Number(c.unit);
    qualityPoints += Number(c.unit) * info.points;
    gradedCount += 1;
  }
  return {
    units,
    qualityPoints,
    gradedCount,
    gpa: units > 0 ? qualityPoints / units : 0,
  };
}

/**
 * Walk the whole academic history in order and produce per-semester results
 * with a running cumulative CGPA at each point in time.
 */
export function computeTimeline(sessions, scaleMap) {
  let cumUnits = 0;
  let cumQp = 0;
  const semesters = [];

  for (const session of sessions) {
    for (const sem of session.semesters) {
      const agg = aggregate(sem.courses, scaleMap);
      cumUnits += agg.units;
      cumQp += agg.qualityPoints;

      const attemptedUnits = sem.courses.reduce((s, c) => s + Number(c.unit), 0);
      const failedUnits = sem.courses
        .filter((c) => isGraded(c, scaleMap) && !gradeInfo(c, scaleMap).isPass)
        .reduce((s, c) => s + Number(c.unit), 0);

      semesters.push({
        semesterId: sem.id,
        semesterName: sem.name,
        sessionId: session.id,
        sessionName: session.name,
        label: `${session.name} · ${sem.name}`,
        shortLabel: shortLabel(session.name, sem.name),
        level: sem.level,
        gpa: round2(agg.gpa),
        units: agg.units,
        attemptedUnits,
        failedUnits,
        qualityPoints: round2(agg.qualityPoints),
        courseCount: sem.courses.length,
        gradedCount: agg.gradedCount,
        cumulativeUnits: cumUnits,
        cgpa: cumUnits > 0 ? round2(cumQp / cumUnits) : 0,
      });
    }
  }

  return {
    semesters,
    totalUnits: cumUnits,
    totalQualityPoints: round2(cumQp),
    cgpa: cumUnits > 0 ? round2(cumQp / cumUnits) : 0,
  };
}

function shortLabel(sessionName, semName) {
  // "2021/2022" -> "21/22" so the x-axis stays legible on narrow charts.
  const years = String(sessionName).match(/\d{4}/g);
  const short = years && years.length >= 2
    ? `${years[0].slice(2)}/${years[1].slice(2)}`
    : String(sessionName).slice(-5);
  const sem = /first|1/i.test(semName) ? 'S1' : /second|2/i.test(semName) ? 'S2' : semName.slice(0, 3);
  return `${short} ${sem}`;
}

/** Degree classification bands. Defined per scale so 4.0 systems work too. */
export function classify(cgpa, maxPoint) {
  if (!cgpa || cgpa <= 0) return { label: 'Not yet classified', tone: 'neutral' };

  const bands5 = [
    [4.5, 'First Class', 'excellent'],
    [3.5, 'Second Class Upper', 'good'],
    [2.4, 'Second Class Lower', 'fair'],
    [1.5, 'Third Class', 'warn'],
    [1.0, 'Pass', 'warn'],
    [0, 'Fail', 'bad'],
  ];
  const bands4 = [
    [3.6, 'First Class', 'excellent'],
    [3.0, 'Second Class Upper', 'good'],
    [2.0, 'Second Class Lower', 'fair'],
    [1.5, 'Third Class', 'warn'],
    [1.0, 'Pass', 'warn'],
    [0, 'Fail', 'bad'],
  ];
  const bands = Math.abs(maxPoint - 4) < 0.01 ? bands4 : bands5;
  for (const [min, label, tone] of bands) {
    if (cgpa >= min) return { label, tone, floor: min };
  }
  return { label: 'Fail', tone: 'bad', floor: 0 };
}

/** Next classification band up, and the CGPA needed to reach it. */
export function nextClassification(cgpa, maxPoint) {
  const order =
    Math.abs(maxPoint - 4) < 0.01
      ? [[3.0, 'Second Class Upper'], [3.6, 'First Class']]
      : [[2.4, 'Second Class Lower'], [3.5, 'Second Class Upper'], [4.5, 'First Class']];
  for (const [min, label] of order) {
    if (cgpa < min) return { label, required: min };
  }
  return null;
}

/**
 * Average grade point required across `remainingUnits` future units to land on
 * `target` CGPA. Returns feasibility against the scale ceiling.
 */
export function requiredAverage({ target, earnedUnits, qualityPoints, remainingUnits, maxPoint }) {
  if (remainingUnits <= 0) {
    return { possible: false, reason: 'no-remaining-units', required: null };
  }
  const required = (target * (earnedUnits + remainingUnits) - qualityPoints) / remainingUnits;
  if (required > maxPoint + 1e-9) {
    return {
      possible: false,
      reason: 'exceeds-ceiling',
      required: round2(required),
      shortfallUnits: shortfallUnits({ target, earnedUnits, qualityPoints, maxPoint }),
    };
  }
  return {
    possible: true,
    required: round2(Math.max(0, required)),
    effortless: required <= 0,
  };
}

/** How many extra units at the maximum grade would be needed to reach a target. */
function shortfallUnits({ target, earnedUnits, qualityPoints, maxPoint }) {
  if (maxPoint <= target) return null;
  const units = (target * earnedUnits - qualityPoints) / (maxPoint - target);
  return Math.ceil(Math.max(0, units));
}

/** Standard deviation helper for consistency scoring. */
function stdev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Simple least-squares slope: is performance trending up or down? */
function slope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const xs = values.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (values[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * The academic intelligence layer: turns raw results into ranked, actionable
 * observations — what is working, what is costing CGPA, and what is required
 * next.
 */
export function analyse({ sessions, scaleMap, maxPoint, goals = [] }) {
  const timeline = computeTimeline(sessions, scaleMap);
  const allCourses = sessions.flatMap((s) => s.semesters.flatMap((m) => m.courses.map((c) => ({
    ...c,
    sessionName: s.name,
    semesterName: m.name,
  }))));

  const graded = allCourses.filter((c) => isGraded(c, scaleMap));
  const cgpa = timeline.cgpa;

  // --- Contribution analysis -------------------------------------------------
  // A course pulls the CGPA up or down in proportion to its units and the
  // distance of its grade point from the current cumulative average.
  const contributions = graded
    .map((c) => {
      const info = gradeInfo(c, scaleMap);
      return {
        id: c.id,
        code: c.code,
        title: c.title,
        unit: Number(c.unit),
        grade: c.grade,
        points: info.points,
        isPass: info.isPass,
        session: c.sessionName,
        semester: c.semesterName,
        impact: round2(Number(c.unit) * (info.points - cgpa)),
      };
    })
    .sort((a, b) => a.impact - b.impact);

  const drags = contributions.filter((c) => c.impact < 0).slice(0, 6);
  const boosters = [...contributions].reverse().filter((c) => c.impact > 0).slice(0, 6);

  // --- Failures & carryovers -------------------------------------------------
  const failures = graded
    .filter((c) => !gradeInfo(c, scaleMap).isPass)
    .map((c) => ({
      id: c.id, code: c.code, title: c.title, unit: Number(c.unit),
      grade: c.grade, session: c.sessionName, semester: c.semesterName,
    }));
  const carryovers = allCourses
    .filter((c) => c.is_carryover)
    .map((c) => ({ id: c.id, code: c.code, title: c.title, unit: Number(c.unit), grade: c.grade }));

  // --- Trend -----------------------------------------------------------------
  const gpaSeries = timeline.semesters.filter((s) => s.gradedCount > 0).map((s) => s.gpa);
  const trendSlope = round2(slope(gpaSeries));
  const consistency = round2(stdev(gpaSeries));
  const last = gpaSeries.at(-1) ?? 0;
  const prev = gpaSeries.at(-2) ?? null;
  const lastDelta = prev == null ? null : round2(last - prev);

  // --- Weak / strong bands ---------------------------------------------------
  const lowThreshold = maxPoint * 0.6;   // D/E territory on a 5.0 scale
  const highThreshold = maxPoint * 0.9;  // A territory
  const weakCourses = graded
    .filter((c) => gradeInfo(c, scaleMap).points < lowThreshold)
    .map((c) => ({
      code: c.code, title: c.title, unit: Number(c.unit), grade: c.grade,
      points: gradeInfo(c, scaleMap).points, session: c.sessionName, semester: c.semesterName,
    }))
    .sort((a, b) => b.unit - a.unit || a.points - b.points);

  const strongCourses = graded
    .filter((c) => gradeInfo(c, scaleMap).points >= highThreshold)
    .map((c) => ({ code: c.code, title: c.title, unit: Number(c.unit), grade: c.grade }));

  // Which subject prefix (CSC, MTH, GST…) is strongest / weakest?
  const byPrefix = new Map();
  for (const c of graded) {
    const prefix = (String(c.code).match(/^[A-Za-z]+/) || ['OTHER'])[0].toUpperCase();
    const info = gradeInfo(c, scaleMap);
    const cur = byPrefix.get(prefix) || { prefix, units: 0, qp: 0, count: 0 };
    cur.units += Number(c.unit);
    cur.qp += Number(c.unit) * info.points;
    cur.count += 1;
    byPrefix.set(prefix, cur);
  }
  const subjectAreas = [...byPrefix.values()]
    .map((p) => ({ ...p, gpa: round2(p.units ? p.qp / p.units : 0) }))
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.gpa - a.gpa);

  // --- Grade distribution ----------------------------------------------------
  const distribution = [];
  const distMap = new Map();
  for (const c of graded) {
    const letter = String(c.grade).toUpperCase();
    const cur = distMap.get(letter) || { letter, count: 0, units: 0, points: gradeInfo(c, scaleMap).points };
    cur.count += 1;
    cur.units += Number(c.unit);
    distMap.set(letter, cur);
  }
  for (const v of distMap.values()) distribution.push(v);
  distribution.sort((a, b) => b.points - a.points);

  // --- Outstanding work ------------------------------------------------------
  const outstanding = allCourses
    .filter((c) => c.status !== 'completed')
    .map((c) => ({
      id: c.id, code: c.code, title: c.title, unit: Number(c.unit),
      status: c.status, session: c.sessionName, semester: c.semesterName,
    }));
  const outstandingUnits = outstanding.reduce((s, c) => s + c.unit, 0);

  // --- Target projections ----------------------------------------------------
  // Remaining units default to whatever is already planned/ongoing; if nothing
  // is planned we model a typical further semester so the advice still lands.
  const projectedRemaining = outstandingUnits > 0 ? outstandingUnits : 24;
  const standardTargets = (Math.abs(maxPoint - 4) < 0.01
    ? [2.0, 2.5, 3.0, 3.5, 3.6]
    : [2.4, 3.0, 3.5, 4.0, 4.5]
  ).filter((t) => t <= maxPoint);

  const targets = standardTargets.map((t) => ({
    target: t,
    reached: cgpa >= t,
    ...requiredAverage({
      target: t,
      earnedUnits: timeline.totalUnits,
      qualityPoints: timeline.totalQualityPoints,
      remainingUnits: projectedRemaining,
      maxPoint,
    }),
  }));

  const goalProjections = goals.map((g) => ({
    ...g,
    reached: cgpa >= g.target_cgpa,
    projection: requiredAverage({
      target: g.target_cgpa,
      earnedUnits: timeline.totalUnits,
      qualityPoints: timeline.totalQualityPoints,
      remainingUnits: projectedRemaining,
      maxPoint,
    }),
  }));

  // --- Narrative insights ----------------------------------------------------
  const insights = [];
  const pct = (v) => `${Math.round((v / maxPoint) * 100)}%`;

  if (graded.length === 0) {
    insights.push({
      tone: 'neutral',
      title: 'No graded results yet',
      body: 'Add a session, a semester and your courses with grades to unlock GPA tracking, trends and forecasting.',
    });
  } else {
    const cls = classify(cgpa, maxPoint);
    insights.push({
      tone: cls.tone,
      title: `Currently on ${cgpa.toFixed(2)} — ${cls.label}`,
      body: `You have earned ${timeline.totalUnits} units across ${graded.length} graded courses, sitting at ${pct(cgpa)} of the maximum attainable ${maxPoint.toFixed(1)}.`,
    });

    if (lastDelta != null) {
      if (lastDelta <= -0.3) {
        insights.push({
          tone: 'bad',
          title: `Performance dropped ${Math.abs(lastDelta).toFixed(2)} points last semester`,
          body: `Your GPA fell from ${prev.toFixed(2)} to ${last.toFixed(2)}. Two consecutive drops are much harder to reverse than one — treat the next semester as a recovery semester.`,
        });
      } else if (lastDelta >= 0.3) {
        insights.push({
          tone: 'excellent',
          title: `Strong recovery: up ${lastDelta.toFixed(2)} points`,
          body: `Your GPA rose from ${prev.toFixed(2)} to ${last.toFixed(2)}. Whatever changed in your study routine last semester is working — keep it.`,
        });
      }
    }

    if (trendSlope < -0.1 && gpaSeries.length >= 3) {
      insights.push({
        tone: 'warn',
        title: 'Downward trend across semesters',
        body: `Across ${gpaSeries.length} semesters your GPA is declining by roughly ${Math.abs(trendSlope).toFixed(2)} points per semester. The cumulative average lags behind, so the damage is still partly hidden.`,
      });
    } else if (trendSlope > 0.1 && gpaSeries.length >= 3) {
      insights.push({
        tone: 'good',
        title: 'Consistent upward trajectory',
        body: `You are gaining about ${trendSlope.toFixed(2)} GPA points per semester. Sustained, that lifts your CGPA well above its current ${cgpa.toFixed(2)}.`,
      });
    }

    if (consistency > 0.5) {
      insights.push({
        tone: 'warn',
        title: 'Results are volatile',
        body: `Your semester GPAs swing by ±${consistency.toFixed(2)}. Erratic semesters usually point to workload spikes or a few high-unit courses going wrong rather than a general ability problem.`,
      });
    }

    if (drags.length) {
      const worst = drags[0];
      const totalDrag = round2(drags.reduce((s, d) => s + d.impact, 0));
      insights.push({
        tone: 'bad',
        title: `${worst.code} is your single biggest CGPA drag`,
        body: `${worst.code} (${worst.unit} units, grade ${worst.grade}) costs you the most weighted quality points. Your bottom ${drags.length} courses together account for ${Math.abs(totalDrag).toFixed(1)} quality points below your own average.`,
      });
    }

    if (failures.length) {
      const failUnits = failures.reduce((s, f) => s + f.unit, 0);
      insights.push({
        tone: 'bad',
        title: `${failures.length} failed course${failures.length > 1 ? 's' : ''} (${failUnits} units)`,
        body: `Failed units still count in the denominator on most 5.0 systems, so ${failures.map((f) => f.code).join(', ')} ${failures.length === 1 ? 'depresses' : 'depress'} your CGPA until ${failures.length === 1 ? 'it is' : 'they are'} retaken and replaced.`,
      });
    }

    const heavyWeak = weakCourses.filter((c) => c.unit >= 3);
    if (heavyWeak.length) {
      insights.push({
        tone: 'warn',
        title: 'Low grades in high-unit courses',
        body: `${heavyWeak.slice(0, 3).map((c) => `${c.code} (${c.unit}u, ${c.grade})`).join(', ')} carry heavy weight. A one-grade improvement in a 4-unit course moves your CGPA roughly four times as much as the same improvement in a 1-unit course.`,
      });
    }

    if (subjectAreas.length >= 2) {
      const best = subjectAreas[0];
      const worst = subjectAreas.at(-1);
      if (best.gpa - worst.gpa >= 0.75) {
        insights.push({
          tone: 'neutral',
          title: `${best.prefix} is your strongest area, ${worst.prefix} your weakest`,
          body: `You average ${best.gpa.toFixed(2)} across ${best.count} ${best.prefix} courses but only ${worst.gpa.toFixed(2)} across ${worst.count} ${worst.prefix} courses — a ${(best.gpa - worst.gpa).toFixed(2)} point gap. Targeted help in ${worst.prefix} is the highest-leverage use of your study time.`,
        });
      }
    }

    if (boosters.length) {
      insights.push({
        tone: 'good',
        title: `${boosters[0].code} is doing the most for you`,
        body: `Your strongest contributions come from ${boosters.slice(0, 3).map((b) => b.code).join(', ')}. Where you can choose electives, lean toward this profile of course.`,
      });
    }

    const nextCls = nextClassification(cgpa, maxPoint);
    if (nextCls) {
      const proj = requiredAverage({
        target: nextCls.required,
        earnedUnits: timeline.totalUnits,
        qualityPoints: timeline.totalQualityPoints,
        remainingUnits: projectedRemaining,
        maxPoint,
      });
      insights.push({
        tone: proj.possible ? 'neutral' : 'warn',
        title: proj.possible
          ? `${nextCls.label} needs a ${proj.required.toFixed(2)} average from here`
          : `${nextCls.label} is out of reach within ${projectedRemaining} units`,
        body: proj.possible
          ? `Over your next ${projectedRemaining} units you would need to average ${proj.required.toFixed(2)} per unit to cross ${nextCls.required.toFixed(2)}.`
          : `Even a perfect ${maxPoint.toFixed(1)} across ${projectedRemaining} units falls short. You would need roughly ${proj.shortfallUnits ?? '—'} units at maximum grade to get there.`,
      });
    }

    if (outstanding.length) {
      insights.push({
        tone: 'neutral',
        title: `${outstanding.length} course${outstanding.length > 1 ? 's' : ''} outstanding (${outstandingUnits} units)`,
        body: `These are ongoing or planned and do not affect your CGPA yet. They are the units your forecasts are built on.`,
      });
    }
  }

  return {
    timeline,
    cgpa,
    totalUnits: timeline.totalUnits,
    totalQualityPoints: timeline.totalQualityPoints,
    classification: classify(cgpa, maxPoint),
    nextClassification: nextClassification(cgpa, maxPoint),
    trend: { slope: trendSlope, consistency, lastDelta, series: gpaSeries },
    contributions: { drags, boosters },
    failures,
    carryovers,
    weakCourses: weakCourses.slice(0, 8),
    strongCourses: strongCourses.slice(0, 8),
    subjectAreas,
    distribution,
    outstanding,
    outstandingUnits,
    projectedRemaining,
    targets,
    goalProjections,
    insights,
    counts: {
      courses: allCourses.length,
      graded: graded.length,
      completed: allCourses.filter((c) => c.status === 'completed').length,
      outstanding: outstanding.length,
      failed: failures.length,
      carryovers: carryovers.length,
      semesters: timeline.semesters.length,
      sessions: sessions.length,
    },
  };
}
