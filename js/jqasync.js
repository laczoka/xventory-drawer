/**
 * Extend underscore.js with support for asynchronous computation using jQuery's Deferred implementation
 * License:
 The MIT License (MIT)

 Copyright (c) 2013 Laszlo Török

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */

var async = {};

/*
    Example: Fetch 10 web pages and return the concatenated text content of all h1 elements

      var urls = [ "http://....", ... ];
      // using simple synchronous map operation, the result will be an array of page contents
      D_arr_page = _.map(urls,$.get);
      // mapping over a "future value" - a Deferred - requires the usage of async.map
      D_arr_h1jointtext = async.map(D_arr_page, function(page) { return $("h1",$(page)).text().toArray().join("\n") });
      // String.concat only accepts array, can't do anything with a Deferred(array)
      // The async.lift1 operation transforms an f(x) function into f(D(x)) -> y
      D_concatenated_h1 = async.lift1(String.prototype.concat)(D_arr_h1jointtext);

 */

// lift :: ('a0 -> ... -> 'an -> 'b) -> (D('a) -> ... -> D('an) -> D('b))
/*
 // THIS doesn't seem to work, so lift1, lift2 was introduced to handle different arities
 // if you have an idea, drop a comment or send a PR
 async.lift = function(f) {
 return function() {
 return $.when.apply($, arguments)
 .then(function() {
 var args = Array.prototype.slice.apply(arguments);
 return f.apply(null, args);});
 }
 }; */
//async.lift1 = async.lift;
//async.lift2 = async.lift;

async.lift1 = function(f) {
    return function(Da1) {
        return $.when(Da1)
            .then(function(a1) {
                return f(a1);});
    }
};

async.lift2 = function(f) {
    return function(Da1, Da2) {
        return $.when(Da1, Da2)
            .then(function(a1,a2) {
                return f(a1,a2);});
    }
};

// reduce :: D({x}) -> (aggrv -> x -> aggrv) -> aggrv -> D(aggrv)
async.reduce = function (Dcoll, f, initv) {
    return $.when(Dcoll,initv)
        .then(function (coll, initv) {
            return _.reduce(coll,f,initv);
        });
};
// map :: D({x}) -> (x -> y) -> D({y})
async.map = function (Dcoll, f) {
    return $.when(Dcoll)
        .then(function(coll) {
            return _.map(coll,f); });
};

// map :: D({x}) -> D({y}) -> (x -> y -> z) -> D({z})
async.map2 = function (Dcoll1, Dcoll2, f) {
    return $.when(Dcoll1, Dcoll2)
        .then(function(coll1, coll2) {
            return _.map(_.zip(coll1, coll2),function (coll1coll2){return f.apply(null, coll1coll2)}); });
};

// collect :: D( { D(x) } ) -> D( {x} )
async.collect = function(DcollDx) {
    return $.when(DcollDx).then(function(collDx) {
        return $.when.apply($,collDx)
            .then(function() {
                return Array.prototype.slice.apply(arguments)})});
};


// flatten :: D( { D({}) } ) -> D({})
async.flatten = function(DcollDcoll) {
    return $.when(DcollDcoll).then(function(collDcoll) {
        return $.when.apply($,collDcoll)
            .then(function() {
                return _.flatten(Array.prototype.slice.apply(arguments))})});
};

async.decider = function(predicatef, thenf, elsef) {
    return function(Dinp) {
        return $.when(Dinp)
            .then(function(inp) {
                return predicatef(inp) ? thenf(inp) : elsef(inp);});
    };
};
