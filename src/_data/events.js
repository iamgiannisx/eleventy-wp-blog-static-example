require("dotenv").config();

if (!process.env.EVENTS_ICAL_FEED) {
  console.error("🚨 Oh no! No iCal feed in the env…");
  return false;
}

const { AssetCache } = require("@11ty/eleventy-cache-assets");
const slugify = require("slugify");
const fetch = require("node-fetch");
const ical = require('node-ical');
const frontMatter = require('front-matter');
const striptags = require('striptags');

// TODO: Switch this for DayJS
const moment = require('moment');
const dayjs = require('dayjs');
const duration = require('dayjs/plugin/duration');
const relativeTime = require('dayjs/plugin/relativeTime');
dayjs
  .extend(duration)
  .extend(relativeTime);

const ENABLE_11TY_CACHE = process.env.ENABLE_11TY_CACHE.toLowerCase() === 'true';
const icalFeedUrl = process.env.EVENTS_ICAL_FEED;

module.exports = () => {

  let globeEvents = new AssetCache("globeEvents");

  if (ENABLE_11TY_CACHE && globeEvents.isCacheValid("1d")) {
    console.log("📅 Serving events from the cache…");
    return globeEvents.getCachedValue();
  }

  console.log("📅 Fetching events");

  return new Promise((resolve, reject) => {
    fetch(icalFeedUrl)
      .then((res) => res.text())
      .then((icalRaw) => {
        // Parse the ical feed
        const allEvents = parseEvents(icalRaw)

        // Save the events to the 11ty cache
        globeEvents.save(allEvents, "json");
        console.log(`📅 Imported ${allEvents.length} events`);

        // Return everything successfully
        resolve(allEvents);
      });
  });
}

function parseEvents(icalRaw) {
  const rangeStart = dayjs().subtract(3, 'months');
  const rangeEnd = dayjs().add(3, 'months');

  const events = ical.parseICS(icalRaw);
  const returnEvents = [];

  for (let k in events) {
    if (!Object.prototype.hasOwnProperty.call(events, k)) continue;

    const event = events[k];
    if (event.type !== 'VEVENT') continue;

    if (!event.rrule) {
      console.log('Summary:', event.summary);
      console.log('Original start:', event.start);
      console.log('Original end:', event.end);

      let eventDesc = removeHtmlForParsing(event.description);
      eventDesc = frontMatter(eventDesc);

      const slug = slugify(event.summary, {
        lower: true,
        strict: true,
      });

      let start = dayjs(event.start);
      let end = dayjs(event.end);
      let duration = end.diff(start);

      returnEvents.push({
        title: event.summary,
        slug: slug,
        location: event.location,
        startDate: start.format(),
        endDate: end.format(),
        duration: dayjs.duration(duration).humanize(),
        body: eventDesc.body,
        data: eventDesc.attributes,
        reoccurring: false
      });

    } else {
      const dates = event.rrule.between(rangeStart.toDate(), rangeEnd.toDate());
      if (dates.length === 0) continue;

      console.log('Summary:', event.summary);
      // console.log('Original start:', event.start);
      // console.log('RRule start:', `${event.rrule.origOptions.dtstart} [${event.rrule.origOptions.tzid}]`);

      dates.forEach(date => {
        let curEvent = event;
        let dateLookupKey = date.toISOString().substring(0, 10);
        let showRecurrence = true;

        // Check to see if there is a reoccurance override
        if ((curEvent.recurrences != undefined) && (curEvent.recurrences[dateLookupKey] != undefined)) {
          curEvent = curEvent.recurrences[dateLookupKey];

        // Check to see if this is a skip
        } else if ((curEvent.exdate != undefined) && (curEvent.exdate[dateLookupKey] != undefined)) {
          showRecurrence = false;
        }

        if (showRecurrence) {
          let start = curEvent.start;
          let end = curEvent.end;

          console.log(curEvent.summary, dayjs(start).format('YY-MM-DD HH:mm'), '–', dayjs(end).format('YY-MM-DD HH:mm'));
          // console.log('Recurrence start:', start)
        }

      });
    }
    console.log('####')

  }

  // for (let k in events) {

  //   if (events.hasOwnProperty(k)) {
  //     var ev = events[k];

  //     if (events[k].type == 'VEVENT') {

  //       let startDate = moment(ev.start);
  //       let endDate = moment(ev.end);

  //       const duration = parseInt(endDate.format("x")) - parseInt(startDate.format("x"));

  //       let eventDesc = removeHtmlForParsing(ev.description);
  //       eventDesc = frontMatter(eventDesc);

  //       const slug = slugify(ev.summary, {
  //         lower: true,
  //         strict: true,
  //       })

  //       // One off events…
  //       if (typeof ev.rrule === 'undefined') {

  //         returnEvents.push({
  //           title: ev.summary,
  //           slug: slug,
  //           location: ev.location,
  //           startDate: startDate.format(),
  //           endDate: endDate.format(),
  //           duration: moment.duration(duration).humanize(),
  //           body: eventDesc.body,
  //           data: eventDesc.attributes,
  //           reoccurring: false
  //         });

  //       } else if (typeof ev.rrule !== 'undefined') {

  //         const dates = ev.rrule.between(
  //           rangeStart.toDate(),
  //           rangeEnd.toDate()
  //         );

  //         if (ev.recurrences !== undefined){
  //           for (let r in ev.recurrences) {
  //             if (moment(new Date(r)).isBetween(rangeStart, rangeEnd) != true) {
  //               dates.push(new Date(r));
  //             }
  //           }
  //         }

  //         for(let i in dates) {
  //           var date = dates[i];
  //           var curEvent = ev;
  //           var showRecurrence = true;
  //           var curDuration = duration;

  //           startDate = moment(date);

  //           // Use just the date of the recurrence to look up overrides and exceptions (i.e. chop off time information)
  //           var dateLookupKey = date.toISOString().substring(0, 10);

  //           // For each date that we're checking, it's possible that there is a recurrence override for that one day.
  //           if ((curEvent.recurrences != undefined) && (curEvent.recurrences[dateLookupKey] != undefined)) {
  //             // We found an override, so for this recurrence, use a potentially different title, start date, and duration.
  //             curEvent = curEvent.recurrences[dateLookupKey];
  //             startDate = moment(curEvent.start);
  //             curDuration = parseInt(moment(curEvent.end).format("x")) - parseInt(startDate.format("x"));

  //           // If there's no recurrence override, check for an exception date.  Exception dates represent exceptions to the rule.
  //           } else if ((curEvent.exdate != undefined) && (curEvent.exdate[dateLookupKey] != undefined)) {
  //             // This date is an exception date, which means we should skip it in the recurrence pattern.
  //             showRecurrence = false;
  //           }

  //           endDate = moment(parseInt(startDate.format("x")) + curDuration, 'x');

  //           // If this recurrence ends before the start of the date range, or starts after the end of the date range,
  //           // don't process it.
  //           if (endDate.isBefore(rangeStart) || startDate.isAfter(rangeEnd)) {
  //             showRecurrence = false;
  //           }

  //           if (showRecurrence === true) {

  //             let eventDesc = removeHtmlForParsing(curEvent.description);
  //             eventDesc = frontMatter(eventDesc);

  //             const slug = slugify(curEvent.summary, {
  //               lower: true,
  //               strict: true,
  //             });

  //             returnEvents.push({
  //               title: curEvent.summary,
  //               slug: slug,
  //               location: curEvent.location,
  //               startDate: startDate.format(),
  //               endDate: endDate.format(),
  //               duration: moment.duration(curDuration).humanize(),
  //               body: eventDesc.body,
  //               data: eventDesc.attributes,
  //               reoccurring: true
  //             });
  //           }

  //         }

  //       }

  //     }
  //   }

  // }

  return returnEvents;
}

// Some event descriptions have <html-blob>s
// We need to get rid of that
function removeHtmlForParsing(input) {
  if (input === undefined || input[0] !== "<") {
    return input;
  }

  let eventDesc = striptags(input, ['br']);
  return eventDesc.replaceAll('<br>','\r\n');
}
