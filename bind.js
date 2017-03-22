'use strict';

var vm = new Vue({
	el : '#app',
	data : {
		facesSpec : '',
		diceSpec : '',
		faces : [],
		dice : [],
		pool : [],
		rollsPower : 100000,
		rollsAllOrMore : false,
		rollResult : '',
		errors : {
			faces : null,
			dice : null
		}
	},
	computed : {
		facesResult : function() {
			if (this.errors.faces) {
				return this.errors.faces;
			}

			var out = '';
			for (var i = 0; i < this.faces.length; i++) {
				out += this.faces[i].code + ' = [' + this.faces[i].body + ']\n';
			}
			return out;
		},
		diceResult : function() {
			if (this.errors.dice) {
				return this.errors.dice;
			}

			var out = '';
			for (var i = 0; i < this.dice.length; i++) {
				out += this.dice[i].code + ' = [' + this.dice[i].body + ']\n';
			}
			return out;
		},
		poolContent : function() {
			var out = '';
			for (var i = 0; i < this.pool.length; i++) {
				out += '<span class=pool_die>' + this.pool[i] + '</span>';
			}
			return out;
		},
		values : function() {
			var values = [];
			for (var i = 0; i < this.faces.length; i++) {
				values = values.concat(this.faces[i].body.filter(function(v) {
					return !~values.indexOf(v);
				}));
			}
			return values.map(function(v) {
				return {
					name : v,
					target : '',
					orMore : false
				};
			});
		}
	},
	methods : {
		parseFaces : debounce(function(e) {
			var facesSpec = this.facesSpec.split(/\n/g);
			
			this.errors.faces = null;
			this.faces.splice(0, this.faces.length);
			
			for (var i = 0; i < facesSpec.length; i++) {
				try {
					var face = parseFace(facesSpec[i]);
					if (face) {
						if (this.faces.some(function(f) { return f.code === face.code; })) {
							throw "duplicate face code '" + face.code + "'.";
						}

						this.faces.push(face);
					}
				} catch (err) {
					console.warn(err);
					this.errors.faces = 'Error @ line ' + (i+1) + ': ' + err;
					return;
				}
			}

			if (this.errors.dice) this.parseDice();

		}, 200),
		parseDice : debounce(function(e) {
			var diceSpec = this.diceSpec.split(/\n/g);

			this.errors.dice = null;
			this.dice.splice(0, this.dice.length);

			for (var i = 0; i < diceSpec.length; i++) {
				try {
					var die = parseDie(diceSpec[i]);
					if (die) {
						if (this.dice.some(function(d) { return d.code === die.code; })) {
							throw "duplicate die code '" + die.code + "'.";
						}

						var faces = this.faces, fprev;
						var undefinedFaces = die.body.filter(function(f) {
							return f !== ' ' && faces.every(function(face) {
								return f !== face.code;
							});
						}).sort().filter(function(f) {
							return fprev !== (fprev = f);
						});
						if (undefinedFaces.length) {
							throw "undefined face codes [" + undefinedFaces + "].";
						}

						this.dice.push(die);

						var pool = this.pool;
					}
				} catch (err) {
					console.warn(err);
					this.errors.dice = 'Error @ line ' + (i+1) + ': ' + err;
				}
			}
		}, 200),
		addToPool : function(die) {
			this.pool.push(die.code);
		},
		removeFromPool : function(die) {
			var idx = this.pool.indexOf(die.code);
			if (~idx) {
				this.pool.splice(idx, 1);
			}
		},
		selectAllOrMore : function() {
			var selectAll = this.rollsAllOrMore;
			for (var i = 0; i < this.values.length; i++) {
				this.values[i].orMore = selectAll
			}
		},
		rollTheDice : function() {
			var inputs = this.$el.querySelectorAll('textarea,input');
			for (var i = 0; i < inputs.length; i++) {
				inputs[i].disabled = true;
			}

			var values = this.values.filter(function(v) { return v.target });
			var targets = {};
			for (var i = 0; i < values.length; i++) {
				var value = values[i];
				targets[value.name] = {
					target : +value.target,
					orMore : value.orMore
				};
			}

			var faces = this.faces;
			function check(dieRolls) {
				var results = {};
				for (var i = 0; i < dieRolls.length; i++) {
					var rollValues = dieRolls[i];
					for (var r = 0; r < rollValues.length; r++) {
						var rv = rollValues[r];
						results[rv] = (results[rv] || (results[rv] = 0)) + 1;
					}
				}

				var valid = true;
				for (var name in targets) {
					if (targets[name].orMore) {
						valid &= results[name] >= targets[name].target;
					} else {
						valid &= results[name] === targets[name].target;
					}
				}

				return valid;
			}

			var totalRolls = +this.rollsPower, favorableRolls = 0;
			var dice = this.dice, pool = this.pool.map(function(d) {
				return dice.find(function(die) {
					return die.code === d;
				});
			});
			for (var i = 0; i < totalRolls; i++) {
				var rolledDice = rollPool(pool).map(function(f) {
					return faces.find(function(face) {
						return face.code === f;
					}).body;
				});
				
				if (check(rolledDice)) {
					favorableRolls++;
				}
			}

			this.rollResult = 'Rolled:      ' + totalRolls + '\n' +
							  'Favorable:   ' + favorableRolls + '\n' +
							  'Probability: ' + (100 * favorableRolls / totalRolls).toFixed(2) + '%';

			for (var i = 0; i < inputs.length; i++) {
				inputs[i].disabled = false;
			}
		}
	}
});

function rollPool(pool) {
	return pool.map(function(die) {
		return rollDie(die);
	});
}
function rollDie(die) {
	var roll = 0 | Math.random() * die.body.length;
	return die.body[roll];
}

var TOK_WS = /\s+/g;
var TOK_CODE = /\w\b/g;
var TOK_LBRACK = /\[/g;
var TOK_RBRACK = /\]/g;
var TOK_EQ = /=/g;
var TOK_PLUS = /\+/g;
var TOK_NUMBER = /\d+/g;
var TOK_TIMES = /x/g;
var TOK_NAME = /\w+/g;

var TOK_ANY = /\S+/g;

function Tokenizer(input) {
	var pos = 0, m, next;

	function match(tok) {
		tok.lastIndex = pos;
		return m = tok.exec(input);
	}

	this.hasMore = function() {
		return pos < input.length;
	};
	this.has = function(tok) {
		match(tok);
		return m && m.index === pos;
	};
	this.skip = function(tok) {
		if (this.has(tok)) {
			pos = m.index + m[0].length;
		}
		return this;
	};
	this.next = function(tok) {
		this.prev = next;
		if (this.has(tok)) {
			pos = m.index + m[0].length;
			return next = m[0];
		}
		return null;
	};
}

function parseFace(spec, row) {
	spec = spec.trim();
	if (!spec) {
		return null;
	}

	var tokens = new Tokenizer(spec);
	
	var code = tokens.next(TOK_CODE);
	if (!code) {
		throw "invalid face code '" + tokens.next(TOK_ANY) + "'.";
	}

	var clauses = [];
	if (tokens.skip(TOK_WS).next(TOK_EQ)) {
		tokens.skip(TOK_WS);

		var clause = parseFaceClause(tokens);
		if (clause) {
			clauses = clauses.concat(clause);
		}

		while (tokens.skip(TOK_WS).has(TOK_PLUS)) {
			tokens.skip(TOK_PLUS).skip(TOK_WS);
			clause = parseFaceClause(tokens);
			if (!clause) {
				throw "after '+', expected Name or Number, '" + tokens.next(TOK_ANY) + "' found instead.";
			}

			clauses = clauses.concat(clause);
		}
	}

	if (tokens.hasMore()) throw "after '" + tokens.prev + "', nothing expected, '" + tokens.next(TOK_ANY) + "' found instead.";

	return {
		code : code.toUpperCase(),
		body : clauses
	};
}
function parseFaceClause(tokens) {
	var number = tokens.next(TOK_NUMBER), clause;
	if (number) {
		number = +number;
		tokens.skip(TOK_WS);
		var x = tokens.next(TOK_TIMES);
		if (!x) throw "after '" + number + "', epected 'x', '" + tokens.next(TOK_ANY) + "' found instead.";

		clause = tokens.next(TOK_NAME);
		if (!clause) throw "after '" + tokens.prev + "', expected Name, '" + tokens.next(TOK_ANY) + "' found instead.";

		return new Array(number).fill(clause);

	} else {
		return tokens.next(TOK_NAME);
	}
}

function parseDie(spec) {
	spec = spec.trim();
	if (!spec) {
		return null;
	}

	var tokens = new Tokenizer(spec);
	
	var code = tokens.next(TOK_CODE);
	if (!code) {
		throw "invalid die code '" + tokens.next(TOK_ANY) + "'.";
	}

	var dieSize = 6;
	if (tokens.skip(TOK_WS).next(TOK_LBRACK)) {
		if (!tokens.skip(TOK_WS).has(TOK_NUMBER)) {
			throw "after '[', expected Number, '" + tokens.next(TOK_ANY) + "' found instead.";
		}

		dieSize = +tokens.next(TOK_NUMBER);
		if (dieSize === 0) throw "die size cannot be 0.";

		if (!tokens.skip(TOK_WS).next(TOK_RBRACK)) {
			throw "after '" + dieSize + "', expected ']', '" + tokens.next(TOK_ANY) + "' found instead.";
		}
	}

	var faces = [];
	if (tokens.skip(TOK_WS).next(TOK_EQ)) {
		var face;
		while (face = tokens.skip(TOK_WS).next(TOK_CODE)) {
			faces.push(face.toUpperCase());
		}
	}

	if (tokens.hasMore()) throw "after '" + tokens.prev + "', nothing expected, '" + tokens.next(TOK_ANY) + "' found instead.";

	var facesNumDiff = dieSize - faces.length;
	if (facesNumDiff < 0) {
		throw "too many faces declared, max " + dieSize + ".";
	}
	if (facesNumDiff > 0) {
		faces = faces.concat(new Array(facesNumDiff).fill(' '));
	}

	return {
		code : code.toUpperCase(),
		body : faces
	};
}

function debounce(fn, delay) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			fn.apply(context, args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, delay);
	};
}
