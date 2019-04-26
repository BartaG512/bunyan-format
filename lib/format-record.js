'use strict';

const util       =  require('util');
const { format } = util;
const http       =  require('http');
const xtend      =  require('xtend');
const ansicolors =  require('ansicolors');
const ansistyles =  require('ansistyles');

const styles = xtend(ansistyles, ansicolors);

// Most of this code is lifted directly from the bunyan ./bin file and should be cleaned up once there is more time
const OM_LONG = 1;
const OM_JSON = 2;
const OM_INSPECT = 3;
const OM_SIMPLE = 4;
const OM_SHORT = 5;
const OM_BUNYAN = 6;
const OM_FROM_NAME = {
	long: OM_LONG,
	json: OM_JSON,
	inspect: OM_INSPECT,
	simple: OM_SIMPLE,
	short: OM_SHORT,
	bunyan: OM_BUNYAN,
};

// Levels
const TRACE = 10;
const DEBUG = 20;
const INFO = 30;
const WARN = 40;
const ERROR = 50;
const FATAL = 60;

const levelFromName = {
	trace: TRACE,
	debug: DEBUG,
	info: INFO,
	warn: WARN,
	error: ERROR,
	fatal: FATAL,
};
const nameFromLevel = {};
const upperNameFromLevel = {};
const upperPaddedNameFromLevel = {};
Object.keys(levelFromName).forEach((name) => {
	const lvl = levelFromName[name];
	nameFromLevel[lvl] = name;
	upperNameFromLevel[lvl] = name.toUpperCase();
	upperPaddedNameFromLevel[lvl] = (
		name.length === 4 ? ' ' : '') + name.toUpperCase();
});

/**
 * Is this a valid Bunyan log record.
 */
function isValidRecord(rec) {
	if (rec.v === null ||
      rec.level === null ||
      rec.name === null ||
      rec.hostname === null ||
      rec.pid === null ||
      rec.time === null ||
      rec.msg === null) {
		// Not valid Bunyan log.
		return false;
	}
	return true;
}

function indent(s) {
	return '  ' + s.split(/\r?\n/).join('\n  ');
}

function stylizeWithColor(s, color) {
	if (!s) return '';
	const fn = styles[color];
	return fn ? fn(s) : s;
}

function stylizeWithoutColor(str, color) {
	return str;
}

/**
 * @param {int} level is the level of the record.
 * @return The level value to its String representation.
 * This is only used on json-related formats output and first suggested at
 * https://github.com/trentm/node-bunyan/issues/194#issuecomment-64858117
 */
function mapLevelToName(level) {
	switch (level) {
		case TRACE:
			return 'TRACE';
		case DEBUG:
			return 'DEBUG';
		case INFO:
			return 'INFO';
		case WARN:
			return 'WARN';
		case ERROR:
			return 'ERROR';
		case FATAL:
			return 'FATAL';
	}
}

/**
 * Print out a single result, considering input options.
 */
module.exports = function formatRecord(rec, opts) {
	function _res(res) {
		let s = '';
		if (res.header) {
			s += res.header.trimRight();
		} else if (res.headers) {
			if (res.statusCode) {
				s += format('HTTP/1.1 %s %s\n', res.statusCode,
					http.STATUS_CODES[res.statusCode]);
			}
			const { headers } = res;
			s += Object.keys(headers).map(
				(h) => {
					return h + ': ' + headers[h];
				})
				.join('\n');
		}
		delete res.header;
		delete res.headers;
		delete res.statusCode;
		if (res.body) {
			s += '\n\n' + (typeof (res.body) === 'object'
				? JSON.stringify(res.body, null, 2) : res.body);
			delete res.body;
		}
		if (res.trailer) {
			s += '\n' + res.trailer;
		}
		delete res.trailer;
		if (s) {
			details.push(indent(s));
		}
		// E.g. for extra 'foo' field on 'res', add 'res.foo' at
		// top-level. This *does* have the potential to stomp on a
		// literal 'res.foo' key.
		Object.keys(res).forEach((k) => {
			rec['res.' + k] = res[k];
		});
	}

	let short = false;
	let time;
	const { line } = rec;
	const stylize = opts.color ? stylizeWithColor : stylizeWithoutColor;
	const outputMode = isNaN(opts.outputMode) ? OM_FROM_NAME[opts.outputMode] : opts.outputMode;

	switch (outputMode) {
		case OM_SHORT:
			short = true;
			/* falls through */
		case OM_LONG:
			//  [time] LEVEL: name[/comp]/pid on hostname (src): msg* (extras...)
			//    msg*
			//    --
			//    long and multi-line extras
			//    ...
			// If 'msg' is single-line, then it goes in the top line.
			// If 'req', show the request.
			// If 'res', show the response.
			// If 'err' and 'err.stack' then show that.
			if (!isValidRecord(rec)) {
				return line + '\n';
			}

			delete rec.v;

			/*
     * We assume the Date is formatted according to ISO8601, in which
     * case we can safely chop off the date information.
     */
			if (short && rec.time[10] == 'T') {
				time = rec.time.substr(11);
				time = stylize(time, opts.timeColor);
			} else {
				time = stylize('[' + rec.time + ']', opts.timeColor);
			}

			delete rec.time;

			var nameStr = rec.name;
			delete rec.name;

			if (rec.component) {
				nameStr += '/' + rec.component;
			}
			delete rec.component;

			if (!short)
				nameStr += '/' + rec.pid;
			delete rec.pid;

			var level = (upperPaddedNameFromLevel[rec.level] || 'LVL' + rec.level);
			if (opts.color) {
				const colorFromLevel = opts.colorFromLevel || {
					10: 'brightCyan',   // TRACE
					20: 'brightYellow',   // DEBUG
					30: 'cyan',   // INFO
					40: 'brightMagenta',  // WARN
					50: 'red',    // ERROR
					60: 'inverse',  // FATAL
				};
				level = stylize(level, colorFromLevel[rec.level]);
			}
			delete rec.level;

			var src = '';
			var s;
			var headers;
			var hostHeaderLine = '';
			if (rec.src && rec.src.file) {
				s = rec.src;
				if (s.func) {
					src = format(' (%s:%d in %s)', s.file, s.line, s.func);
				} else {
					src = format(' (%s:%d)', s.file, s.line);
				}
				src = stylize(src, 'green');
			}
			delete rec.src;

			var { hostname } = rec;
			delete rec.hostname;

			var extras = [];
			var details = [];

			if (rec.req_id) {
				extras.push('req_id=' + rec.req_id);
			}
			delete rec.req_id;

			var onelineMsg;
			if (rec.msg.indexOf('\n') !== -1) {
				onelineMsg = '';
				details.push(indent(stylize(rec.msg, opts.msgColor)));
			} else {
				onelineMsg = ' ' + stylize(rec.msg, opts.msgColor);
			}
			delete rec.msg;

			if (rec.req && typeof (rec.req) === 'object') {
				const { req } = rec;
				delete rec.req;
				headers = req.headers;
				s = format('%s %s HTTP/%s%s', req.method,
					req.url,
					req.httpVersion || '1.1',
					(headers
						? '\n' + Object.keys(headers).map((h) => {
							return h + ': ' + headers[h];
						})
							.join('\n')
						: '')
				);
				delete req.url;
				delete req.method;
				delete req.httpVersion;
				delete req.headers;
				if (req.body) {
					s += '\n\n' + (typeof (req.body) === 'object'
						? JSON.stringify(req.body, null, 2) : req.body);
					delete req.body;
				}
				if (req.trailers && Object.keys(req.trailers) > 0) {
					s += '\n' + Object.keys(req.trailers).map((t) => {
						return t + ': ' + req.trailers[t];
					})
						.join('\n');
				}
				delete req.trailers;
				details.push(indent(s));
				// E.g. for extra 'foo' field on 'req', add 'req.foo' at
				// top-level. This *does* have the potential to stomp on a
				// literal 'req.foo' key.
				Object.keys(req).forEach((k) => {
					rec['req.' + k] = req[k];
				});
			}

			if (rec.client_req && typeof (rec.client_req) === 'object') {
				const { client_req } = rec;
				delete rec.client_req;
				headers = client_req.headers;
				s = '';
				if (client_req.address) {
					hostHeaderLine = 'Host: ' + client_req.address;
					if (client_req.port)
						hostHeaderLine += ':' + client_req.port;
					hostHeaderLine += '\n';
				}
				delete client_req.headers;
				delete client_req.address;
				delete client_req.port;
				s += format('%s %s HTTP/%s\n%s%s', client_req.method,
					client_req.url,
					client_req.httpVersion || '1.1',
					hostHeaderLine,
					(headers
						? Object.keys(headers).map(
							(h) => {
								return h + ': ' + headers[h];
							})
							.join('\n')
						: ''));
				delete client_req.method;
				delete client_req.url;
				delete client_req.httpVersion;
				if (client_req.body) {
					s += '\n\n' + (typeof (client_req.body) === 'object'
						? JSON.stringify(client_req.body, null, 2)
						: client_req.body);
					delete client_req.body;
				}
				// E.g. for extra 'foo' field on 'client_req', add
				// 'client_req.foo' at top-level. This *does* have the potential
				// to stomp on a literal 'client_req.foo' key.
				Object.keys(client_req).forEach((k) => {
					rec['client_req.' + k] = client_req[k];
				});
				details.push(indent(s));
			}

			if (rec.res && typeof (rec.res) === 'object') {
				_res(rec.res);
				delete rec.res;
			}
			if (rec.client_res && typeof (rec.client_res) === 'object') {
				_res(rec.client_res);
				delete rec.res;
			}

			if (rec.err && rec.err.stack) {
				details.push(indent(rec.err.stack));
				delete rec.err;
			}

			var leftover = Object.keys(rec);
			for (let i = 0; i < leftover.length; i++) {
				const key = leftover[i];
				let value = rec[key];
				let stringified = false;
				if (typeof (value) !== 'string') {
					value = JSON.stringify(value, null, 2);
					stringified = true;
				}
				if (value.indexOf('\n') !== -1 || value.length > 50) {
					details.push(indent(key + ': ' + value));
				} else if (!stringified && (value.indexOf(' ') != -1 ||
        value.length === 0)) {
					extras.push(key + '=' + JSON.stringify(value));
				} else {
					extras.push(key + '=' + value);
				}
			}

			extras = stylize(
				(extras.length ? ' (' + extras.join(', ') + ')' : ''), opts.extraColor);
			details = stylize(
				(details.length ? details.join('\n  --\n') + '\n' : ''), opts.metaColor);
			if (!short)
				return format('%s %s: %s on %s%s:%s%s\n%s',
					time,
					level,
					nameStr,
					hostname || '<no-hostname>',
					src,
					onelineMsg,
					extras,
					details);
			return format('%s %s %s:%s%s\n%s',
				time,
				level,
				nameStr,
				onelineMsg,
				extras,
				details);
			break;

		case OM_INSPECT:
			return util.inspect(rec, false, Infinity, true) + '\n';

		case OM_BUNYAN:
			if (opts.levelInString) {
				rec.level = mapLevelToName(rec.level);
			}
			return JSON.stringify(rec, null, 0) + '\n';

		case OM_JSON:
			if (opts.levelInString) {
				rec.level = mapLevelToName(rec.level);
			}
			return JSON.stringify(rec, null, opts.jsonIndent) + '\n';

		case OM_SIMPLE:
			/* JSSTYLED */
			// <http://logging.apache.org/log4j/1.2/apidocs/org/apache/log4j/SimpleLayout.html>
			if (!isValidRecord(rec)) {
				return line + '\n';
			}
			return format('%s - %s\n',
				upperNameFromLevel[rec.level] || 'LVL' + rec.level,
				rec.msg);
		default:
			throw new Error('unknown output mode: ' + opts.outputMode);
	}
};

