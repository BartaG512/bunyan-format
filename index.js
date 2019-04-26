'use strict';

const stream = require('stream');
const util = require('util');
const formatRecord = require('./lib/format-record');
const xtend = require('xtend');

const { Writable } = stream;

module.exports = BunyanFormatWritable;

util.inherits(BunyanFormatWritable, Writable);

/**
 * Creates a writable stream that formats bunyan records written to it.
 *
 * @name BunyanFormatWritable
 * @function
 * @param opts {Options} passed to bunyan format function
 *  - outputMode: short|long|simple|json|bunyan
 *  - color (true): toggles colors in output
 *  - colorFromLevel: allows overriding log level colors
 * @param out {Stream} (process.stdout) writable stream to write
 * @return {WritableStream} that you can pipe bunyan output into
 */
function BunyanFormatWritable(opts, out) {
	if (!(this instanceof BunyanFormatWritable)) return new BunyanFormatWritable(opts, out);

	opts = opts || {};
	opts.objectMode = true;
	Writable.call(this, opts);

	this.opts = xtend({
		outputMode: 'short',
		color: true,
		msgColor: 'cyan',
		timeColor: 'brightWhite',
		metaColor: 'brightRed',
		extraColor: 'brightCyan',
		colorFromLevel: {
			10: 'brightBlack',    // TRACE
			20: 'brightYellow',    // DEBUG
			30: 'brightGreen',          // INFO
			40: 'brightMagenta',        // WARN
			50: 'red',            // ERROR
			60: 'brightRed',      // FATAL
		},
	}, opts);
	this.out = out || process.stdout;
}

BunyanFormatWritable.prototype._write = function(chunk, encoding, cb) {
	let rec;
	try {
		rec = JSON.parse(chunk);
		this.out.write(formatRecord(rec, this.opts));
	} catch (e) {
		this.out.write(chunk);
	}
	cb();
};
