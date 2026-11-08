import { describe, expect, it } from 'vitest';
import { parseCourseXml, validateCourseXml } from './xmlCourse';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<curso><meta><title>T</title><summary>S</summary><author>A</author><expirationtimestart>2w 3d</expirationtimestart><maxlessonsperday>2</maxlessonsperday><maxlessonspertime>4/2w</maxlessonspertime></meta>
<section id="s" title="S" expiration-time-final="1month" max-lessons-per-week="3"><lesson id="l" title="L" lesson_retention_duration="1d" lockout-time-until-the-next-lesson="2h"><content>Hola</content><domanslides number-playbacks-allowed="2"/></lesson></section></curso>`;

describe('XML temporal policies', () => {
  it('accepts and parses optional course, section, lesson, and Doman policy values', () => {
    expect(validateCourseXml(xml)).toEqual([]);
    const course = parseCourseXml(xml);
    expect(course.policy.expirationTimeStart).toBe('2w 3d');
    expect(course.policy.maxLessonsPerDay).toBe(2);
    expect(course.policy.maxLessonsPerTime).toBe('4/2w');
    expect(course.units[0].sectionPolicy.expirationTimeFinal).toBe('1month');
    expect(course.units[0].policy.lessonRetentionDuration).toBe('1d');
    expect(course.units[0].policy.lockoutTimeUntilNextLesson).toBe('2h');
    expect(course.units[0].blocks.at(-1)).toMatchObject({ type: 'domanslides', slides: [{ filters: { 'number-playbacks-allowed': '2' } }] });
  });

  it('rejects malformed durations, limits, and playback counts', () => {
    expect(validateCourseXml(xml.replace('2w 3d', 'soon'))).not.toEqual([]);
    expect(validateCourseXml(xml.replace('<maxlessonsperday>2</maxlessonsperday>', '<maxlessonsperday>-2</maxlessonsperday>'))).not.toEqual([]);
    expect(validateCourseXml(xml.replace('number-playbacks-allowed="2"', 'number-playbacks-allowed="x"'))).not.toEqual([]);
  });
});
