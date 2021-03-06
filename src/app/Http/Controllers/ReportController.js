'use strict'

const Database = use('Database')
const _ = use('lodash')
const moment = use('moment')

class ReportController {

  query(start_iso, end_iso, filters) {
    const results = Database.select(
        'sessions.id AS session_id',
        'sessions.iso_week AS iso_week',
        'sessions.utm_term AS utm_term',
        'sessions.utm_source AS utm_source',
        'sessions.utm_name AS utm_name',
        'sessions.utm_content AS utm_content',
        'sessions.utm_medium AS utm_medium',
        Database.raw(`COUNT(activities.id) AS activity_id`),
        Database.raw(`COUNT(users.purchase_made) AS billed`),
        Database.raw(`COUNT(DISTINCT sessions.session_id) AS unique_sessions`),
        Database.raw(`COUNT(CASE
          WHEN activities.opportunity_type = 1 THEN 1
          ELSE NULL
        END) AS sum_leads_contact`),
        Database.raw(`COUNT(CASE
          WHEN activities.opportunity_type = 2 THEN 1
          ELSE NULL
        END) AS sum_leads_subscribe`),
        Database.raw(`COUNT(CASE
          WHEN activities.opportunity_type = 3 THEN 1
          ELSE NULL
        END) AS sum_leads_purchase`)
      )
      .from('sessions')
      .leftJoin('activities', 'sessions.id', 'activities.session_id')
      .leftJoin('users', 'sessions.user_id', 'users.id')
      .groupByRaw('sessions.iso_week, sessions.utm_term, sessions.utm_source, sessions.utm_name, sessions.utm_content');
    _.forEach(filters, function(value, index) {
      index = 'sessions.' + index;
      if ( index === 'sessions.iso_week' && (value.week_from.length !== 0 || value.week_to.length !=- 0)) {
        var start = moment(value.week_from).year() + ' | ' + moment(value.week_from).isoWeeks()
        var end = moment(value.week_to).year() + ' | ' + moment(value.week_to).isoWeeks()

        if (value.week_from === '') {
          start = '2015 | 52'
        }

        if (value.week_to === '') {
          end = moment().year() + ' | ' + moment().isoWeeks()
        }

        results.whereBetween('sessions.iso_week', [start, end])
      } else if (index === 'sessions.utm_name_split' && value.length !== 0) {
        var searchString = ''
        _.forEach(value, function (search) {
          if (search.length !== 0)
            searchString += search + '|'
        })
        searchString = searchString.split(',').join('|').slice(0, -1)
        if (searchString !== '')
          results.whereRaw("utm_name REGEXP '" + searchString + "'")
      } else if (index !== 'sessions.iso_week' && value.length !== 0) {
        results.whereIn(index, value)
      }
    })
    return results;
  }

  cohortQuery(iso_start, iso_end) {
    const results = Database.select(
        'sessions.session_id AS session_id', 
        'sessions.utm_source AS utm_source',
        'sessions.utm_medium AS utm_medium',
        'sessions.utm_name  AS utm_name',
        'activities.activity_id AS activity_id',
        'activities.opportunity_type AS activity_type',
        'users.created_at AS user_creation',
        'users.email AS user_id'
      )
      .from('sessions')
      .leftJoin('users', 'users.session_id', 'sessions.session_id')
      .leftJoin('activities', 'activities.session_id', 'sessions.session_id')
      .where('users.email', '<>', '')
      .groupBy('users.email');

    return results;
  }

  adspend(start, end, filters) {
    const ad_spend = Database
      .select('*')
      .from('ad_spends')

    // filters.iso_week.week_from = '2016 | 01'
    // filters.iso_week.week_to = '2017 | 04'

    _.forEach(filters, function(value, index) {
      index = 'ad_spends.' + index;
      if ( index === 'ad_spends.iso_week' && (value.week_from.length !== 0 || value.week_to.length !=- 0)) {
        var start = moment(value.week_from).year() + ' | ' + moment(value.week_from).isoWeeks()
        var end = moment(value.week_to).year() + ' | ' + moment(value.week_to).isoWeeks()

        if (value.week_from === '') {
          start = '2015 | 52'
        }

        if (value.week_to === '') {
          end = moment().year() + ' | ' + moment().isoWeeks()
        }

        ad_spend.whereBetween('ad_spends.iso_week', [start, end])
      } else if (index === 'ad_spends.utm_name_split' && value.length !== 0) {
        var searchString = ''
        _.forEach(value, function (search) {
          if (search.length !== 0)
            searchString += search + '|'
        })
        searchString = searchString.split(',').join('|').slice(0, -1)
        if (searchString !== '')
          ad_spend.whereRaw("utm_name REGEXP '" + searchString + "'")
      } else if (index !== 'ad_spends.iso_week' && value.length !== 0) {
        ad_spend.whereIn(index, value)
      }
    })

    return ad_spend
  }

  * index(request, response) {
    var filters = request.all();

    //get the results for a certain period
    const results = yield this.query('2016 | 01', '2016 | 53', filters);

    Database.on('sql', console.log)
  
    const results1 = yield this.adspend('2016 | 01', '2016 | 53', filters);

    //structure of the json
    var pruned_results = {
      utm_params: {
        utm_term: [],
        utm_source: [],
        source: [],
        activity: [],
        country: [],
        city: [],
        utm_name: [],
        utm_content: [],
        utm_medium: []
      },
      cac: {
        session: 0,
        subscribe: 0,
        contact: 0,
        purchase: 0,
      },
      activity: {
        id: [],
        sum_leads_contact: 0,
        sum_leads_subscribe: 0,
        sum_leads_purchase: 0,
        billed: 0
      },
      sessions: {
        total_unique: 0,
        total_unique_ids: []
      },
      users: {
        unique: 0,
        unique_list: []
      },
      filter_options: {},
      time: {}
    };

    _.forEach(results, function (value) {

      //format for the iso_week (copy of pruned_results basically) all iso_weeks added together should equal 
      var iso_week = {
        utm_params: {
          utm_term: [],
          utm_source: [],
          source: [],
          activity: [],
          country: [],
          city: [],
          utm_name: [],
          utm_content: [],
          utm_medium: []
        },
        activity: {
          id: [],
          sum_leads_contact: 0,
          sum_leads_subscribe: 0,
          sum_leads_purchase: 0,
          billed: 0
        },
        sessions: {
          total_unique: 0,
          total_unique_ids: []
        },
        users: {
          unique: 0,
          unique_list: []
        },
        time: {},
        week: ''
      };

      //sessions
      pruned_results.sessions.total_unique = pruned_results.sessions.total_unique + value.unique_sessions;
      pruned_results.sessions.total_unique_ids.push(value.session_id);

      //utm params
      pruned_results.utm_params.utm_term.push(value.utm_term);
      pruned_results.utm_params.utm_source.push(value.utm_source);

      var utm_name_split = value.utm_name.split('*')
      if (utm_name_split.length == 4) {
        pruned_results.utm_params.source.push(utm_name_split[0])
        pruned_results.utm_params.activity.push(utm_name_split[1])
        pruned_results.utm_params.country.push(utm_name_split[2])
        pruned_results.utm_params.city.push(utm_name_split[3])
      }

      pruned_results.utm_params.utm_name.push(value.utm_name);
      pruned_results.utm_params.utm_content.push(value.utm_content);
      pruned_results.utm_params.utm_medium.push(value.utm_medium);

      //activity info 
      pruned_results.activity.id.push(value.activity_id);
      pruned_results.activity.sum_leads_contact = pruned_results.activity.sum_leads_contact + value.sum_leads_contact;
      pruned_results.activity.sum_leads_subscribe = pruned_results.activity.sum_leads_subscribe + value.sum_leads_subscribe
      pruned_results.activity.sum_leads_purchase = pruned_results.activity.sum_leads_purchase + value.sum_leads_purchase;
      pruned_results.activity.billed = pruned_results.activity.billed + value.billed;

      // if the week already exists, append data to it
      if (pruned_results.time[value.iso_week]) {
        
        //access to the iso_week
        var s = pruned_results.time[value.iso_week];

        //sessions
        iso_week.sessions.total_unique = s.sessions.total_unique + value.unique_sessions;
        
        //session_ids
        s.sessions.total_unique_ids.push(value.session_id);
        iso_week.sessions.total_unique_ids = s.sessions.total_unique_ids;

        //utm params
        //utm term
        s.utm_params.utm_term.push(value.utm_term);
        iso_week.utm_params.utm_term = s.utm_params.utm_term;

        //utm source
        s.utm_params.utm_source.push(value.utm_source);
        iso_week.utm_params.utm_source = s.utm_params.utm_source;

        var utm_name_split = value.utm_name.split('*')
        if (utm_name_split.length == 4) {
          s.utm_params.source.push(utm_name_split[0])
          iso_week.utm_params.source = s.utm_params.source

          s.utm_params.activity.push(utm_name_split[1])
          iso_week.utm_params.activity = s.utm_params.activity

          s.utm_params.country.push(utm_name_split[2])
          iso_week.utm_params.country = s.utm_params.country

          s.utm_params.city.push(utm_name_split[3])
          iso_week.utm_params.city = s.utm_params.city
        }


        //utm name
        s.utm_params.utm_name.push(value.utm_name);
        iso_week.utm_params.utm_name = s.utm_params.utm_name;

        //utm content
        s.utm_params.utm_content.push(value.utm_content);
        iso_week.utm_params.utm_content = s.utm_params.utm_content;

        //utm medium
        s.utm_params.utm_medium.push(value.utm_medium);
        iso_week.utm_params.utm_medium = s.utm_params.utm_medium;

        //activity info
        s.activity.id.push(value.activity_id);
        iso_week.activity.id = s.activity.id;

        iso_week.week = value.iso_week;

        //sum of leads by type (opportunity_type)
        iso_week.activity.sum_leads_contact = s.activity.sum_leads_contact + value.sum_leads_contact;
        iso_week.activity.sum_leads_subscribe = s.activity.sum_leads_subscribe + value.sum_leads_subscribe;
        iso_week.activity.sum_leads_purchase = s.activity.sum_leads_purchase + value.sum_leads_purchase;
        iso_week.activity.billed = s.activity.billed + value.billed;
      } else { //new week, do this

        //sessions
        iso_week.sessions.total_unique = value.unique_sessions;
        iso_week.sessions.total_unique_ids.push(value.session_id);

        //utm params
        iso_week.utm_params.utm_term.push(value.utm_term);
        iso_week.utm_params.utm_source.push(value.utm_source);

        var utm_name_split = value.utm_name.split('*')
        if (utm_name_split.length == 4) {
          iso_week.utm_params.source.push(utm_name_split[0])
          iso_week.utm_params.activity.push(utm_name_split[1])
          iso_week.utm_params.country.push(utm_name_split[2])
          iso_week.utm_params.city.push(utm_name_split[3])
        }

        iso_week.utm_params.utm_name.push(value.utm_name);
        iso_week.utm_params.utm_content.push(value.utm_content);
        iso_week.utm_params.utm_medium.push(value.utm_medium);

        //activity info
        iso_week.activity.id.push(value.activity_id);
        iso_week.week = value.iso_week;
        iso_week.activity.sum_leads_contact = value.sum_leads_contact;
        iso_week.activity.sum_leads_subscribe = value.sum_leads_subscribe;
        iso_week.activity.sum_leads_purchase = value.sum_leads_purchase;
        iso_week.activity.billed = value.billed;
      }

      pruned_results.time[value.iso_week] = iso_week;
    });

    _.forEach(pruned_results.time, function (time, index) {

      console.log(index)
      console.log(time)
      const week = time.week
      const cac = {
        session: 0,
        contact: 0,
        subscribe: 0,
        purchase: 0
      }
      _.forEach(results1, function (value) {
        if (value.iso_week == week) {
          cac.session += Math.round(Number(value.amount))
        }
      })

      cac.contact = Math.round(cac.session / time.activity.sum_leads_contact)
      cac.subscribe = Math.round(cac.session / time.activity.sum_leads_subscribe)
      cac.purchase = Math.round(cac.session / time.activity.sum_leads_purchase)

      time.cac = cac;

      pruned_results.time[index] = time
    })


    pruned_results.filter_options.utm_params = {
      utm_term: _.uniq(pruned_results.utm_params.utm_term),
      utm_source: _.uniq(pruned_results.utm_params.utm_source),
      utm_name: _.uniq(pruned_results.utm_params.utm_name),
      utm_content: _.uniq(pruned_results.utm_params.utm_content),
      utm_medium: _.uniq(pruned_results.utm_params.utm_medium),
      source: _.uniq(pruned_results.utm_params.source),
      activity: _.uniq(pruned_results.utm_params.activity),
      country: _.uniq(pruned_results.utm_params.country),
      city: _.uniq(pruned_results.utm_params.city)
    }

    return response.json(pruned_results);
    // return response.send('<pre>' + JSON.stringify(pruned_results, null, 4) + '</pre>');
  }

  * cohortReport (request, response) {
    const results = yield this.cohortQuery('2016 | 01', '2016 | 53');

    return response.json(results);
  }
}

module.exports = ReportController
