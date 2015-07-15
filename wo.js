var myVersion = "0.47b", myProductName = "World Outline"; 
var fs = require ("fs");
var request = require ("request");
var opmlParser = require ("opmlparser");
var http = require ("http"); 
var https = require ("https");
var urlpack = require ("url");
var marked = require ("marked");
var strftime = require ("strftime");
var dns = require ("dns");

var riverConfig = {
	enclosureIconHtml: "<i class=\"fa fa-headphones\"></i>",
	flEnclosureIcon: true,
	flShareIcon: true,
	flOutlinesExpandedByDefault: false, //4/16/15 by DW
	getExtraFooterCallback: function (item, theFooter) {
		return (theFooter);
		},
	includeFeedInRiverCallback: function (feed) {
		return (true);
		},
	includeItemInRiverCallback: function (item) {
		return (true);
		}
	};
var serialnumForRiverRender = 0;
var configFname = "config.json";
var appConfig = {
	port: 80,
	"disqusGroupname": "scripting",
	"urlRootOutline": "http://liveblog.co/users/davewiner/outlines/outline005.opml"
	}
var globalDomains;
var worldOutlineStats = {
	ctStarts: 0, 
	whenLastStart: new Date (0),
	ctHits: 0, ctHitsToday: 0,
	whenLastHit: new Date (0),
	ctWriteStats: 0,
	whenLastWriteStats: new Date (0),
	hitsByDomain: {},
	hitsByDomainToday: {},
	hitsByUrlToday: {}
	};
var fnameStats = "stats.json", flStatsDirty = false;

var renderedPagesFolder = "renderedPages/";

var outlineCache = new Object ();

function sameDay (d1, d2) { 
	//returns true if the two dates are on the same day
	d1 = new Date (d1);
	d2 = new Date (d2);
	return ((d1.getFullYear () == d2.getFullYear ()) && (d1.getMonth () == d2.getMonth ()) && (d1.getDate () == d2.getDate ()));
	}
function dayGreaterThanOrEqual (d1, d2) { //9/2/14 by DW
	d1 = new Date (d1);
	d1.setHours (0);
	d1.setMinutes (0);
	d1.setSeconds (0);
	
	d2 = new Date (d2);
	d2.setHours (0);
	d2.setMinutes (0);
	d2.setSeconds (0);
	
	return (d1 >= d2);
	}
function stringLower (s) {
	if (s === undefined) { //1/26/15 by DW
		return ("");
		}
	s = s.toString (); //1/26/15 by DW
	return (s.toLowerCase ());
	}
function secondsSince (when) { 
	var now = new Date ();
	when = new Date (when);
	return ((now - when) / 1000);
	}
function padWithZeros (num, ctplaces) { 
	var s = num.toString ();
	while (s.length < ctplaces) {
		s = "0" + s;
		}
	return (s);
	}
function getDatePath (theDate, flLastSeparator) {
	if (theDate === undefined) {
		theDate = new Date ();
		}
	else {
		theDate = new Date (theDate); //8/12/14 by DW -- make sure it's a date type
		}
	if (flLastSeparator === undefined) {
		flLastSeparator = true;
		}
	
	var month = padWithZeros (theDate.getMonth () + 1, 2);
	var day = padWithZeros (theDate.getDate (), 2);
	var year = theDate.getFullYear ();
	
	if (flLastSeparator) {
		return (year + "/" + month + "/" + day + "/");
		}
	else {
		return (year + "/" + month + "/" + day);
		}
	}
function multipleReplaceAll (s, adrTable, flCaseSensitive, startCharacters, endCharacters) { 
	if(flCaseSensitive===undefined){
		flCaseSensitive = false;
		}
	if(startCharacters===undefined){
		startCharacters="";
		}
	if(endCharacters===undefined){
		endCharacters="";
		}
	for( var item in adrTable){
		var replacementValue = adrTable[item];
		var regularExpressionModifier = "g";
		if(!flCaseSensitive){
			regularExpressionModifier = "gi";
			}
		var regularExpressionString = (startCharacters+item+endCharacters).replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
		var regularExpression = new RegExp(regularExpressionString, regularExpressionModifier);
		s = s.replace(regularExpression, replacementValue);
		}
	return s;
	}
function endsWith (s, possibleEnding, flUnicase) {
	if ((s === undefined) || (s.length == 0)) { 
		return (false);
		}
	var ixstring = s.length - 1;
	if (flUnicase === undefined) {
		flUnicase = true;
		}
	if (flUnicase) {
		for (var i = possibleEnding.length - 1; i >= 0; i--) {
			if (stringLower (s [ixstring--]) != stringLower (possibleEnding [i])) {
				return (false);
				}
			}
		}
	else {
		for (var i = possibleEnding.length - 1; i >= 0; i--) {
			if (s [ixstring--] != possibleEnding [i]) {
				return (false);
				}
			}
		}
	return (true);
	}
function stringContains (s, whatItMightContain, flUnicase) { //11/9/14 by DW
	if (flUnicase === undefined) {
		flUnicase = true;
		}
	if (flUnicase) {
		s = s.toLowerCase ();
		whatItMightContain = whatItMightContain.toLowerCase ();
		}
	return (s.indexOf (whatItMightContain) != -1);
	}
function beginsWith (s, possibleBeginning, flUnicase) { 
	if (s.length == 0) { //1/1/14 by DW
		return (false);
		}
	if (flUnicase === undefined) {
		flUnicase = true;
		}
	if (flUnicase) {
		for (var i = 0; i < possibleBeginning.length; i++) {
			if (stringLower (s [i]) != stringLower (possibleBeginning [i])) {
				return (false);
				}
			}
		}
	else {
		for (var i = 0; i < possibleBeginning.length; i++) {
			if (s [i] != possibleBeginning [i]) {
				return (false);
				}
			}
		}
	return (true);
	}
function isAlpha (ch) {
	return (((ch >= 'a') && (ch <= 'z')) || ((ch >= 'A') && (ch <= 'Z')));
	}
function isNumeric (ch) {
	return ((ch >= '0') && (ch <= '9'));
	}
function trimLeading (s, ch) {
	while (s.charAt (0) === ch) {
		s = s.substr (1);
		}
	return (s);
	}
function trimTrailing (s, ch) { 
	while (s.charAt (s.length - 1) === ch) {
		s = s.substr (0, s.length - 1);
		}
	return (s);
	}
function trimWhitespace (s) { //rewrite -- 5/30/14 by DW
	function isWhite (ch) {
		switch (ch) {
			case " ": case "\r": case "\n": case "\t":
				return (true);
			}
		return (false);
		}
	if (s === undefined) { //9/10/14 by DW
		return ("");
		}
	while (isWhite (s.charAt (0))) {
		s = s.substr (1);
		}
	while (s.length > 0) {
		if (!isWhite (s.charAt (0))) {
			break;
			}
		s = s.substr (1);
		}
	while (s.length > 0) {
		if (!isWhite (s.charAt (s.length - 1))) {
			break;
			}
		s = s.substr (0, s.length - 1);
		}
	return (s);
	}
function addPeriodAtEnd (s) {
	s = trimWhitespace (s);
	if (s.length == 0) {
		return (s);
		}
	switch (s [s.length - 1]) {
		case ".":
		case ",":
		case "?":
		case "\"":
		case "'":
		case ":":
		case ";":
		case "!":
			return (s);
		default:
			return (s + ".");
		}
	}
function getBoolean (val) { //12/5/13 by DW
	switch (typeof (val)) {
		case "string":
			if (val.toLowerCase () == "true") {
				return (true);
				}
			break;
		case "boolean":
			return (val);
		case "number":
			if (val == 1) {
				return (true);
				}
			break;
		}
	return (false);
	}
function bumpUrlString (s) { //5/10/14 by DW
	if (s === undefined) {
		s = "0";
		}
	function bumpChar (ch) {
		function num (ch) {
			return (ch.charCodeAt (0));
			}
		if ((ch >= "0") && (ch <= "8")) {
			ch = String.fromCharCode (num (ch) + 1);
			}
		else {
			if (ch == "9") {
				ch = "a";
				}
			else {
				if ((ch >= "a") && (ch <= "y")) {
					ch = String.fromCharCode (num (ch) + 1);
					}
				else {
					throw "rollover!";
					}
				}
			}
		return (ch);
		}
	try {
		var chlast = bumpChar (s [s.length - 1]);
		s = s.substr (0, s.length - 1) + chlast;
		return (s);
		}
	catch (tryError) {
		if (s.length == 1) {
			return ("00");
			}
		else {
			s = s.substr (0, s.length - 1);
			s = bumpUrlString (s) + "0";
			return (s);
			}
		}
	}
function stringDelete (s, ix, ct) {
	var start = ix - 1;
	var end = (ix + ct) - 1;
	var s1 = s.substr (0, start);
	var s2 = s.substr (end);
	return (s1 + s2);
	}
function replaceAll (s, searchfor, replacewith) {
	function escapeRegExp (string) {
		return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
		}
	return (s.replace (new RegExp (escapeRegExp (searchfor), 'g'), replacewith));
	}
function stringCountFields (s, chdelim) {
	var ct = 1;
	if (s.length == 0) {
		return (0);
		}
	for (var i = 0; i < s.length; i++) {
		if (s [i] == chdelim) {
			ct++;
			}
		}
	return (ct)
	}
function stringNthField (s, chdelim, n) {
	var splits = s.split (chdelim);
	if (splits.length >= n) {
		return splits [n-1];
		}
	return ("");
	}
function dateYesterday (d) {
	return (new Date (new Date (d) - (24 * 60 * 60 * 1000)));
	}
function stripMarkup (s) { //5/24/14 by DW
	if ((s === undefined) || (s == null) || (s.length == 0)) {
		return ("");
		}
	return (s.replace (/(<([^>]+)>)/ig, ""));
	}
function maxStringLength (s, len, flWholeWordAtEnd, flAddElipses) {
	if (flWholeWordAtEnd === undefined) {
		flWholeWordAtEnd = true;
		}
	if (flAddElipses === undefined) { //6/2/14 by DW
		flAddElipses = true;
		}
	if (s.length > len) {
		s = s.substr (0, len);
		if (flWholeWordAtEnd) {
			while (s.length > 0) {
				if (s [s.length - 1] == " ") {
					if (flAddElipses) {
						s += "...";
						}
					break;
					}
				s = s.substr (0, s.length - 1); //pop last char
				}
			}
		}
	return (s);
	}
function random (lower, upper) {
	var range = upper - lower + 1;
	return (Math.floor ((Math.random () * range) + lower));
	}
function removeMultipleBlanks (s) { //7/30/14 by DW
	return (s.toString().replace (/ +/g, " "));
	}
function jsonStringify (jstruct, flFixBreakage) { //7/30/14 by DW
	//Changes
		//6/16/15; 10:43:25 AM by DW
			//Andrew Shell reported an issue in the encoding of JSON that's solved by doing character replacement. 
			//However, this is too big a change to make for all the code that calls this library routine, so we added a boolean flag, flFixBreakage.
			//If this proves to be harmless, we'll change the default to true. 
			//http://river4.smallpict.com/2015/06/16/jsonEncodingIssueSolved.html
	if (flFixBreakage === undefined) {
		flFixBreakage = false;
		}
	var s = JSON.stringify (jstruct, undefined, 4);
	if (flFixBreakage) {
		s = s.replace (/\u2028/g,'\\u2028').replace (/\u2029/g,'\\u2029');
		}
	return (s);
	}
function stringAddCommas (x) { //5/27/14 by DW
	return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}
function readHttpFile (url, callback, timeoutInMilliseconds) { //5/27/14 by DW
	if (timeoutInMilliseconds === undefined) {
		timeoutInMilliseconds = 30000;
		}
	var jxhr = $.ajax ({ 
		url: url,
		dataType: "text" , 
		timeout: timeoutInMilliseconds 
		}) 
	.success (function (data, status) { 
		callback (data);
		}) 
	.error (function (status) { 
		console.log ("readHttpFile: url == " + url + ", error == " + jsonStringify (status));
		callback (undefined);
		});
	}
function readHttpFileThruProxy (url, type, callback) { //10/25/14 by DW
	var urlReadFileApi = "http://pub2.fargo.io:5347/httpReadUrl";
	if (type === undefined) {
		type = "text/plain";
		}
	var jxhr = $.ajax ({ 
		url: urlReadFileApi + "?url=" + encodeURIComponent (url) + "&type=" + encodeURIComponent (type),
		dataType: "text" , 
		timeout: 30000 
		}) 
	.success (function (data, status) { 
		if (callback != undefined) {
			callback (data);
			}
		}) 
	.error (function (status) { 
		console.log ("readHttpFileThruProxy: url == " + url + ", error == " + status.statusText + ".");
		if (callback != undefined) {
			callback (undefined);
			}
		});
	}
function stringPopLastField (s, chdelim) { //5/28/14 by DW
	if (s.length == 0) {
		return (s);
		}
	if (endsWith (s, chdelim)) {
		s = stringDelete (s, s.length, 1);
		}
	while (s.length > 0) {
		if (endsWith (s, chdelim)) {
			return (stringDelete (s, s.length, 1));
			}
		s = stringDelete (s, s.length, 1);
		}
	return (s);
	}
function stringPopExtension (s) { //4/29/15 by DW
	for (var i = s.length - 1; i >= 0; i--) {
		if (s [i] == ".") {
			return (stringMid (s, 1, i));
			}
		}
	return (s);
	}
function filledString (ch, ct) { //6/4/14 by DW
	var s = "";
	for (var i = 0; i < ct; i++) {
		s += ch;
		}
	return (s);
	}
function encodeXml (s) { //7/15/14 by DW
	var charMap = {
		'<': '&lt;',
		'>': '&gt;',
		'&': '&amp;',
		'"': '&'+'quot;'
		};
	s = s.toString();
	s = s.replace(/\u00A0/g, " ");
	var escaped = s.replace(/[<>&"]/g, function(ch) {
		return charMap [ch];
		});
	return escaped;
	}
function decodeXml (s) { //11/7/14 by DW
	return (s.replace (/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));
	}
function hotUpText (s, url) { //7/18/14 by DW
	
	if (url === undefined) { //makes it easier to call -- 3/14/14 by DW
		return (s);
		}
	
	function linkit (s) {
		return ("<a href=\"" + url + "\" target=\"_blank\">" + s + "</a>");
		}
	var ixleft = s.indexOf ("["), ixright = s.indexOf ("]");
	if ((ixleft == -1) || (ixright == -1)) {
		return (linkit (s));
		}
	if (ixright < ixleft) {
		return (linkit (s));
		}
	
	var linktext = s.substr (ixleft + 1, ixright - ixleft - 1); //string.mid (s, ixleft, ixright - ixleft + 1);
	linktext = "<a href=\"" + url + "\" target=\"_blank\">" + linktext + "</a>";
	
	var leftpart = s.substr (0, ixleft);
	var rightpart = s.substr (ixright + 1, s.length);
	s = leftpart + linktext + rightpart;
	return (s);
	}
function getDomainFromUrl (url) { //7/11/15 by DW
	if ((url != null ) && (url != "")) {
		url = url.replace("www.","").replace("www2.", "").replace("feedproxy.", "").replace("feeds.", "");
		var root = url.split('?')[0]; // cleans urls of form http://domain.com?a=1&b=2
		url = root.split('/')[2];
		}
	return (url);
	};
function getFavicon (url) { //7/18/14 by DW
	var domain = getDomainFromUrl (url);
	return ("http://www.google.com/s2/favicons?domain=" + domain);
	};
function getURLParameter (name) { //7/21/14 by DW
	return (decodeURI ((RegExp(name + '=' + '(.+?)(&|$)').exec(location.search)||[,null])[1]));
	}
function urlSplitter (url) { //7/15/14 by DW
	var pattern = /^(?:([A-Za-z]+):)?(\/{0,3})([0-9.\-A-Za-z]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?([^#]*))?(?:#(.*))?$/;
	var result = pattern.exec (url);
	if (result == null) {
		result = [];
		result [5] = url;
		}
	var splitUrl = {
		scheme: result [1],
		host: result [3],
		port: result [4],
		path: result [5],
		query: result [6],
		hash: result [7]
		};
	return (splitUrl);
	}
function innerCaseName (text) { //8/12/14 by DW
	var s = "", ch, flNextUpper = false;
	text = stripMarkup (text); 
	for (var i = 0; i < text.length; i++) {
		ch = text [i];
		if (isAlpha (ch) || isNumeric (ch)) { 
			if (flNextUpper) {
				ch = ch.toUpperCase ();
				flNextUpper = false;
				}
			else {
				ch = ch.toLowerCase ();
				}
			s += ch;
			}
		else {
			if (ch == ' ') { 
				flNextUpper = true;
				}
			}
		}
	return (s);
	}
function hitCounter (counterGroup, counterServer) { //8/12/14 by DW
	var defaultCounterGroup = "scripting", defaultCounterServer = "http://counter2.fargo.io:5337/counter";
	var thispageurl = location.href;
	if (counterGroup === undefined) {
		counterGroup = defaultCounterGroup;
		}
	if (counterServer === undefined) {
		counterServer = defaultCounterServer;
		}
	if (thispageurl === undefined) {
		thispageurl = "";
		}
	if (endsWith (thispageurl, "#")) {
		thispageurl = thispageurl.substr (0, thispageurl.length - 1);
		}
	var jxhr = $.ajax ({
		url: counterServer + "?group=" + encodeURIComponent (counterGroup) + "&referer=" + encodeURIComponent (document.referrer) + "&url=" + encodeURIComponent (thispageurl),
		dataType: "jsonp",
		jsonpCallback : "getData",
		timeout: 30000
		})
	.success (function (data, status, xhr) {
		console.log ("hitCounter: counter ping accepted by server, group == " + counterGroup + ", page url == " + thispageurl);
		})
	.error (function (status, textStatus, errorThrown) {
		console.log ("hitCounter: counter ping error: " + textStatus);
		});
	}
function stringMid (s, ix, len) { //8/12/14 by DW
	return (s.substr (ix-1, len));
	}
function getCmdKeyPrefix () { //8/15/14 by DW
	if (navigator.platform.toLowerCase ().substr (0, 3) == "mac") {
		return ("&#8984;");
		}
	else {
		return ("Ctrl+"); 
		}
	}
function getRandomSnarkySlogan () { //8/15/14 by DW
	var snarkySlogans = [
		"Good for the environment.", 
		"All baking done on premises.", 
		"Still diggin!", 
		"It's even worse than it appears.", 
		"Ask not what the Internet can do for you...", 
		"You should never argue with a crazy man.", 
		"Welcome back my friends to the show that never ends.", 
		"Greetings, citizen of Planet Earth. We are your overlords. :-)", 
		"We don't need no stinkin rock stars.", 
		"This aggression will not stand.", 
		"Pay no attention to the man behind the curtain.", 
		"Only steal from the best.", 
		"Reallll soooon now...", 
		"What a long strange trip it's been.", 
		"Ask not what the Internet can do for you.", 
		"When in doubt, blog.",
		"Shut up and eat your vegetables.",
		"Don't slam the door on the way out.",
		"Yeah well, that's just, you know, like, your opinion, man.",
		"So, it has come to this."
		]
	return (snarkySlogans [random (0, snarkySlogans.length - 1)]);
	}
function dayOfWeekToString (theDay) { //8/23/14 by DW
	var weekday = [
		"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
		];
	return (weekday[theDay]);
	}
function viewDate (when, flShortDayOfWeek)  {  //8/23/14 by DW
	var now = new Date ();
	when = new Date (when);
	if (sameDay (when, now))  { 
		return (timeString (when, false)) //2/9/13 by DW;
		}
	else  { 
		var oneweek = 1000 * 60 * 60 * 24 * 7;
		var cutoff = now - oneweek;
		if (when > cutoff)   { //within the last week
			var s = dayOfWeekToString (when.getDay ());
			if (flShortDayOfWeek)  { 
				s = s.substring (0, 3);
				}
			return (s);
			}
		else  { 
			return (when.toLocaleDateString ());
			}
		}
	}
function timeString (when, flIncludeSeconds) { //8/26/14 by DW
	var hour = when.getHours (), minutes = when.getMinutes (), ampm = "AM", s;
	if (hour >= 12) {
		ampm = "PM";
		}
	if (hour > 12) {
		hour -= 12;
		}
	if (hour == 0) {
		hour = 12;
		}
	if (minutes < 10) {
		minutes = "0" + minutes;
		}
	if (flIncludeSeconds) { 
		var seconds = when.getSeconds ();
		if (seconds < 10) {
			seconds = "0" + seconds;
			}
		s = hour + ":" + minutes + ":" + seconds + ampm;
		}
	else {
		s = hour + ":" + minutes + ampm;
		}
	return (s);
	}
function stringLastField (s, chdelim) { //8/27/14 by DW
	var ct = stringCountFields (s, chdelim);
	if (ct == 0) { //8/31/14 by DW
		return (s);
		}
	return (stringNthField (s, chdelim, ct));
	}
function maxLengthString (s, maxlength) { //8/27/14 by DW
	if (s.length > maxlength) {
		s = s.substr (0, maxlength);
		while (true) {
			var len = s.length; flbreak = false;
			if (len == 0) {
				break;
				}
			if (s [len - 1] == " ") {
				flbreak = true;
				}
			s = s.substr (0, len - 1);
			if (flbreak) {
				break;
				}
			}
		s = s + "...";
		}
	return (s);
	}
function formatDate (theDate, dateformat, timezone) { //8/28/14 by DW
	if (theDate === undefined) {
		theDate = new Date ();
		}
	if (dateformat === undefined) {
		dateformat = "%c";
		}
	if (timezone === undefined) {
		timezone =  - (new Date ().getTimezoneOffset () / 60);
		}
	try {
		var offset = new Number (timezone);
		var d = new Date (theDate);
		var localTime = d.getTime ();
		var localOffset = d.getTimezoneOffset () *  60000;
		var utc = localTime + localOffset;
		var newTime = utc + (3600000 * offset);
		return (new Date (newTime).strftime (dateformat));
		}
	catch (tryerror) {
		return (new Date (theDate).strftime (dateformat));
		}
	}
function addPeriodToSentence (s) { //8/29/14 by DW
	if (s.length > 0) {
		var fladd = true;
		var ch = s [s.length - 1];
		switch (ch) {
			case "!": case "?": case ":":
				fladd = false;
				break;
			default:
				if (endsWith (s, ".\"")) {
					fladd = false;
					}
				else {
					if (endsWith (s, ".'")) {
						fladd = false;
						}
					}
			}
		if (fladd) {
			s += ".";
			}
		}
	return (s);
	}
function copyScalars (source, dest) { //8/31/14 by DW
	for (var x in source) { 
		var type, val = source [x];
		if (val instanceof Date) { 
			val = val.toString ();
			}
		type = typeof (val);
		if ((type != "object") && (type != undefined)) {
			dest [x] = val;
			}
		}
	}
function linkToDomainFromUrl (url, flshort, maxlength) { //10/10/14 by DW
	var splitUrl = urlSplitter (url), host = splitUrl.host.toLowerCase ();
	if (flshort === undefined) {
		flshort = false;
		}
	if (flshort) {
		var splithost = host.split (".");
		if (splithost.length == 3) {
			host = splithost [1];
			}
		else {
			host = splithost [0];
			}
		}
	else {
		if (beginsWith (host, "www.")) {
			host = stringDelete (host, 1, 4);
			}
		}
	
	if (maxlength != undefined) { //10/10/14; 10:46:56 PM by DW
		if (host.length > maxlength) {
			host = stringMid (host, 1, maxlength) + "...";
			}
		}
	
	return ("<a class=\"aLinkToDomainFromUrl\" href=\"" + url + "\" target=\"blank\">" + host + "</a>");
	}
function getRandomPassword (ctchars) { //10/14/14 by DW
	var s= "", ch;
	while (s.length < ctchars)  {
		ch = String.fromCharCode (random (33, 122));
		if (isAlpha (ch) || isNumeric (ch)) {
			s += ch;
			}
		}
	return (s.toLowerCase ());
	}
function monthToString (theMonthNum) { //11/4/14 by DW
	
	
	var theDate;
	if (theMonthNum === undefined) {
		theDate = new Date ();
		}
	else {
		theDate = new Date ((theMonthNum + 1) + "/1/2014");
		}
	return (formatDate (theDate, "%B"));
	}
function getCanonicalName (text) { //11/4/14 by DW
	var s = "", ch, flNextUpper = false;
	text = stripMarkup (text); //6/30/13 by DW
	for (var i = 0; i < text.length; i++) {
		ch = text [i];
		if (isAlpha (ch) || isNumeric (ch)) {
			if (flNextUpper) {
				ch = ch.toUpperCase ();
				flNextUpper = false;
				}
			else {
				ch = ch.toLowerCase ();
				}
			s += ch;
			}
		else { 
			if (ch == ' ') {
				flNextUpper = true;
				}
			}
		}
	return (s);
	}
function clockNow () { //11/7/14 by DW
	return (new Date ());
	}
function sleepTillTopOfMinute (callback) { //11/22/14 by DW
	var ctseconds = Math.round (60 - (new Date ().getSeconds () + 60) % 60);
	if (ctseconds == 0) {
		ctseconds = 60;
		}
	setTimeout (everyMinute, ctseconds * 1000); 
	}
function scheduleNextRun (callback, ctMillisecsBetwRuns) { //11/27/14 by DW
	var ctmilliseconds = ctMillisecsBetwRuns - (Number (new Date ().getMilliseconds ()) + ctMillisecsBetwRuns) % ctMillisecsBetwRuns;
	setTimeout (callback, ctmilliseconds); 
	}
function urlEncode (s) { //12/4/14 by DW
	return (encodeURIComponent (s));
	}
function popTweetNameAtStart (s) { //12/8/14 by DW
	var ch;
	s = trimWhitespace (s);
	if (s.length > 0) {
		if (s.charAt (0) == "@") {
			while (s.charAt (0) != " ") {
				s = s.substr (1)
				}
			while (s.length > 0) {
				ch = s.charAt (0);
				if ((ch != " ") && (ch != "-")) {
					break;
					}
				s = s.substr (1)
				}
			}
		}
	return (s);
	}
function httpHeadRequest (url, callback) { //12/17/14 by DW
	var jxhr = $.ajax ({
		url: url,
		type: "HEAD",
		dataType: "text",
		timeout: 30000
		})
	.success (function (data, status, xhr) {
		callback (xhr); //you can do xhr.getResponseHeader to get one of the header elements
		})
	}
function httpExt2MIME (ext) { //12/24/14 by DW
	var lowerext = stringLower (ext);
	var map = {
		"au": "audio/basic",
		"avi": "application/x-msvideo",
		"bin": "application/x-macbinary",
		"css": "text/css",
		"dcr": "application/x-director",
		"dir": "application/x-director",
		"dll": "application/octet-stream",
		"doc": "application/msword",
		"dtd": "text/dtd",
		"dxr": "application/x-director",
		"exe": "application/octet-stream",
		"fatp": "text/html",
		"ftsc": "text/html",
		"fttb": "text/html",
		"gif": "image/gif",
		"gz": "application/x-gzip",
		"hqx": "application/mac-binhex40",
		"htm": "text/html",
		"html": "text/html",
		"jpeg": "image/jpeg",
		"jpg": "image/jpeg",
		"js": "application/javascript",
		"mid": "audio/x-midi",
		"midi": "audio/x-midi",
		"mov": "video/quicktime",
		"mp3": "audio/mpeg",
		"pdf": "application/pdf",
		"png": "image/png",
		"ppt": "application/mspowerpoint",
		"ps": "application/postscript",
		"ra": "audio/x-pn-realaudio",
		"ram": "audio/x-pn-realaudio",
		"sit": "application/x-stuffit",
		"sys": "application/octet-stream",
		"tar": "application/x-tar",
		"text": "text/plain",
		"txt": "text/plain",
		"wav": "audio/x-wav",
		"wrl": "x-world/x-vrml",
		"xml": "text/xml",
		"zip": "application/zip"
		};
	for (x in map) {
		if (stringLower (x) == lowerext) {
			return (map [x]);
			}
		}
	return ("text/plain");
	}
function kilobyteString (num) { //1/24/15 by DW
	num = Number (num) / 1024;
	return (num.toFixed (2) + "K");
	}
function megabyteString (num) { //1/24/15 by DW
	var onemeg = 1024 * 1024;
	if (num <= onemeg) {
		return (kilobyteString (num));
		}
	num = Number (num) / onemeg;
	return (num.toFixed (2) + "MB");
	}
function gigabyteString (num) { //1/24/15 by DW
	var onegig = 1024 * 1024 * 1024;
	if (num <= onegig) {
		return (megabyteString (num));
		}
	num = Number (num) / onegig;
	return (num.toFixed (2) + "GB");
	}
function dateToNumber (theDate) { //2/15/15 by DW
	return (Number (new Date (theDate)));
	}

var templateConfig = {
	urlDefaultTemplateFile: "http://liveblog.co/template2/index.html",
	urlDefaultTemplateScripts: "http://liveblog.co/template2/scripts.js",
	urlDefaultTemplateStyles: "http://liveblog.co/template2/styles.css",
	urlDefaultImage: "http://scripting.com/2015/04/29/babel.png"
	};

function gatherTemplateAtts (theNodeBeingPublished, allTheAtts) {
	var thisfilepath = undefined;
	function doparent (theNode) {
		if (theNode.parent !== undefined) {
			doparent (theNode.parent);
			}
		copyScalars (theNode, allTheAtts);
		if (theNode.path !== undefined) {
			thisfilepath = trimWhitespace (theNode.path);
			if (endsWith (thisfilepath, "/")) {
				thisfilepath = stringMid (thisfilepath, 1, thisfilepath.length - 1);
				}
			if (beginsWith (thisfilepath, "/")) {
				thisfilepath = stringDelete (thisfilepath, 1, 1);
				}
			}
		else {
			if (theNode.name === undefined) {
				theNode.name = innerCaseName (theNode.text); 
				}
			if (thisfilepath != undefined) {
				thisfilepath += "/" + theNode.name;
				}
			}
		}
	doparent (theNodeBeingPublished);
	if (thisfilepath !== undefined) {
		allTheAtts.thisfilepath = thisfilepath;
		}
	}
function getTemplateText (pagetable, urlTemplate, readHttpFile, callback) {
	if (pagetable.template !== undefined) {
		console.log ("getTemplateText: user-defined template == " + pagetable.template);
		urlTemplate = pagetable.template;
		}
	else {
		if (urlTemplate === undefined) {
			urlTemplate = templateConfig.urlDefaultTemplateFile;
			}
		}
	readHttpFile (urlTemplate, function (templatetext) {
		if (callback !== undefined) {
			callback (templatetext);
			}
		});
	}
function renderThroughTemplate (bodytext, theNode, urlTemplate, readHttpFile, callback) {
	var pagetable = new Object (), htmltext, now = new Date ();
	function getPostDescription (theOutline) { //return the text of the first sub
		if (pagetable.description === undefined) {
			if ((theOutline.subs === undefined) || (theOutline.subs.length == 0)) {
				return ("");
				}
			else {
				return (stripMarkup (theOutline.subs [0].text));
				}
			}
		return (pagetable.description);
		}
	function getPostImage () { 
		if (pagetable.image === undefined) {
			return (templateConfig.urlDefaultImage);
			}
		return (pagetable.image);
		}
	function getCommentHtml () {
		var s =  
			"<div id=\"disqus_thread\"></div>\n<script type=\"text/javascript\">var disqus_shortname = '[%disqusgroupname%]';\n(function() {\nvar dsq = document.createElement('script'); dsq.type = 'text/javascript'; dsq.async = true;\ndsq.src = '//' + disqus_shortname + '.disqus.com/embed.js';\n(document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0]).appendChild(dsq);\n})();\n</script>";
		
		var groupname = appConfig.disqusGroupname;
		if (pagetable.disqusGroupname !== undefined) {
			groupname = pagetable.disqusGroupname;
			}
		
		s = replaceAll (s, "[%disqusgroupname%]", groupname);
		return (s);
		}
	gatherTemplateAtts (theNode, pagetable);
	
	if (beginsWith (pagetable.title, "system.temp.op.netOutlines")) { //5/28/15 by DW
		pagetable.title = "";
		}
	
	getTemplateText (pagetable, urlTemplate, readHttpFile, function (templatetext) {
		//make sure pagetable.created is defined
			if (pagetable.created === undefined) {
				if (pagetable.datemodified !== undefined) {
					pagetable.created = new Date (pagetable.datemodified);
					}
				else {
					pagetable.created = now;
					}
				}
		//make sure pagetable.text is defined
			if (pagetable.text === undefined) {
				pagetable.text = pagetable.title;
				}
		//make sure pagetable.ownername is defined -- 7/10/15 by DW
			if (pagetable.ownername === undefined) {
				pagetable.ownername = appConfig.defaultOwnerName;
				}
		//pagetable.pagetitle
			if (pagetable.title.length == 0) {
				pagetable.pagetitle = pagetable.text;
				}
			else {
				pagetable.pagetitle = pagetable.text; //7/14/15 by DW
				}
		pagetable.urlstyles = templateConfig.urlDefaultTemplateStyles;
		pagetable.urlscripts = templateConfig.urlDefaultTemplateScripts;
		pagetable.when = new Date (pagetable.created);
		pagetable.postDate = strftime ("%a, %b %e, %Y at %l:%M %p", pagetable.when);
		pagetable.siteName = pagetable.title;
		pagetable.flFromEditor = true;
		pagetable.ogtitle = pagetable.text;
		pagetable.authorname = pagetable.ownername;
		pagetable.ogdescription = getPostDescription (theNode);
		pagetable.ogimage = getPostImage ();
		
		
		
		pagetable.pagetableinjson = jsonStringify (pagetable);
		pagetable.theoutline = jsonStringify (outlineToJstruct (theNode)); //7/9/15 by DW
		pagetable.comments = getCommentHtml ();
		pagetable.bodytext = bodytext;
		htmltext = multipleReplaceAll (templatetext, pagetable, false, "[%", "%]");
		callback (htmltext);
		});
	}



function fsSureFilePath (path, callback) { 
	var splits = path.split ("/");
	path = ""; //1/8/15 by DW
	if (splits.length > 0) {
		function doLevel (levelnum) {
			if (levelnum < (splits.length - 1)) {
				path += splits [levelnum] + "/";
				fs.exists (path, function (flExists) {
					if (flExists) {
						doLevel (levelnum + 1);
						}
					else {
						fs.mkdir (path, undefined, function () {
							doLevel (levelnum + 1);
							});
						}
					});
				}
			else {
				if (callback != undefined) {
					callback ();
					}
				}
			}
		doLevel (0);
		}
	else {
		if (callback != undefined) {
			callback ();
			}
		}
	}
function logRequest (httpRequest) { //5/27/15 by DW
	var parsedUrl = urlpack.parse (httpRequest.url, true), lowerpath = parsedUrl.pathname.toLowerCase ();
	var now = new Date (), host = httpRequest.headers.host, referrer, port = "80";
	if (stringContains (host, ":")) {
		port = stringNthField (host, ":", 2);
		host = stringNthField (host, ":", 1);
		}
	//set referrer
		referrer = httpRequest.headers.referer;
		if (referrer == undefined) {
			referrer = "";
			}
		
	dns.reverse (httpRequest.connection.remoteAddress, function (err, domains) {
		var client = httpRequest.connection.remoteAddress;
		if (!err) {
			if (domains.length > 0) {
				client = domains [0];
				}
			}
		if (client == undefined) { //1/25/15 by DW
			client = "";
			}
		console.log (now.toLocaleTimeString () + " " + httpRequest.method + " " + host + ":" + port + " " + lowerpath + " " + referrer + " " + client);
		});
	}
function writeStats (f, stats, callback) {
	fs.writeFile (f, jsonStringify (stats), function (err) {
		if (err) {
			console.log ("writeStats: error == " + err.message);
			}
		if (callback != undefined) {
			callback ();
			}
		});
	}
function readStats (f, stats, callback) {
	fs.exists (f, function (flExists) {
		if (flExists) {
			fs.readFile (f, function (err, data) {
				if (err) {
					console.log ("readStats: error reading file " + f + " == " + err.message)
					if (callback != undefined) {
						callback ();
						}
					}
				else {
					var storedStats = JSON.parse (data.toString ());
					for (var x in storedStats) {
						stats [x] = storedStats [x];
						}
					writeStats (f, stats, function () {
						if (callback != undefined) {
							callback ();
							}
						});
					}
				});
			}
		else {
			writeStats (f, stats, function () {
				if (callback != undefined) {
					callback ();
					}
				});
			}
		});
	}


function saveRenderedPage (host, lowerpath, htmltext) {
	var f;
	if (endsWith (lowerpath, "/")) {
		lowerpath += "index.html";
		}
	f = renderedPagesFolder + stringLower (host) + lowerpath;
	fsSureFilePath (f, function () {
		fs.exists (f, function (flExists) {
			if (!flExists) {
				fs.writeFile (f, htmltext, function (err) {
					if (err) {
						console.log ("saveRenderedPage: error == " + err.message + ", f == " + f);
						}
					});
				}
			});
		});
	}


function debugNode (theNode) {
	var attstext = "";
	for (var x in theNode) {
		if ((x != "subs") && (x != "parent") && (x != "created")) {
			if (attstext.length > 0) {
				attstext +=  ", ";
				}
			attstext += x + "=" + theNode [x];
			}
		}
	return (attstext);
	}
function getNodeType (theNode) {
	if (theNode.type == "include") {
		return (theNode.includetype); //this allows include nodes to have types
		}
	else {
		return (theNode.type);
		}
	}
function typeIsDoc (theNode) {
	var type = getNodeType (theNode);
	return ((type !== undefined) && (type != "include") && (type != "link") && (type != "tweet"));
	}
function getNameAtt (theNode) {
	var nameatt = theNode.name;
	if (nameatt === undefined) {
		nameatt = innerCaseName (theNode.text);
		}
	return (nameatt);
	}
function readOpml (urloutline, callback) { 
	if (outlineCache [urloutline] !== undefined) {
		if (callback !== undefined) {
			callback (outlineCache [urloutline], undefined);
			}
		}
	else {
		var outlineArray = new Array ();
		var req = request (urloutline);
		var opmlparser = new opmlParser ();
		var metadata = undefined;
		flparseerror = false;
		
		req.on ("response", function (res) {
			var stream = this;
			if (res.statusCode == 200) {
				stream.pipe (opmlparser);
				}
			});
		req.on ("error", function (res) {
			console.log ("readOpml: error reading outline. urloutline == " + urloutline);
			if (callback != undefined) {
				callback (undefined, res);
				}
			});
		opmlparser.on ("error", function (error) {
			console.log ("readOpml: opml parser error == " + error.message);
			if (callback != undefined) {
				callback (undefined, error);
				}
			flparseerror = true;
			});
		opmlparser.on ("readable", function () {
			var outline;
			while (outline = this.read ()) {
				var ix = Number (outline ["#id"]);
				outlineArray [ix] = outline;
				if (metadata === undefined) {
					metadata = this.meta;
					}
				}
			});
		opmlparser.on ("end", function () {
			if (flparseerror) {
				return;
				}
			var theOutline = new Object ();
			theOutline.parent = undefined; //this is how you can tell you hit the top in a traversal to the summit
			
			//copy elements of the metadata object into the root of the outline
				function copyone (name) {
					var val = metadata [name];
					if ((val !== undefined) && (val != null)) {
						theOutline [name] = val;
						}
					}
				copyone ("title");
				copyone ("datecreated");
				copyone ("datemodified");
				copyone ("ownername");
				copyone ("owneremail");
				copyone ("description");
			
			for (var i = 0; i < outlineArray.length; i++) {
				var obj = outlineArray [i];
				if (obj != null) {
					var idparent = obj ["#parentid"], parent;
					if (idparent == 0) {
						parent = theOutline;
						}
					else {
						parent = outlineArray [idparent];
						}
					if (parent.subs === undefined) {
						parent.subs = new Array ();
						}
					parent.subs [parent.subs.length] = obj;
					obj.parent = parent;
					delete obj ["#id"];
					delete obj ["#parentid"];
					}
				}
			outlineCache [urloutline] = theOutline;
			if (callback != undefined) {
				callback (theOutline, undefined);
				}
			});
		}
	}
function readInclude (theIncludeNode, callback) {
	console.log ("readInclude: url == " + theIncludeNode.url);
	readOpml (theIncludeNode.url, function (theOutline, err) {
		if (err) {
			callback (undefined);
			}
		else {
			callback (theOutline);
			}
		});
	}
function outlineToText (theOutline, flIncludeAtts) { 
	var theText = "", indentlevel = 0; 
	if (flIncludeAtts === undefined) {
		flIncludeAtts = true;
		}
	function visitSubs (theNode) {
		if (theNode.subs != undefined) {
			for (var i = 0; i < theNode.subs.length; i++) {
				var sub = theNode.subs [i], attstext = "", linetext;
				if (flIncludeAtts) {
					for (var x in sub) {
						if ((x != "subs") && (x != "text") && (x != "parent") && (x != "created")) {
							if (attstext.length > 0) {
								attstext +=  ", ";
								}
							attstext += x + "=" + sub [x];
							}
						}
					if (attstext.length > 0) {
						attstext = " (" + attstext + ")";
						}
					}
				//set linetext
					var linetext = sub.text;
					if (linetext.length > 50) {
						linetext = stringMid (linetext, 1, 50) + "...";
						}
				theText += filledString ("\t", indentlevel) + linetext + attstext + "\n";
				indentlevel++;
				visitSubs (sub);
				indentlevel--;
				}
			}
		}
	visitSubs (theOutline);
	return (theText);
	}
function outlineToJstruct (theOutline) { //7/9/15 by DW
	var theCopy = new Object ();
	function copySubs (sourcesubs, destsubs) {
		for (var i = 0; i < sourcesubs.length; i++) {
			destsubs [i] = outlineToJstruct (sourcesubs [i]);
			}
		}
	copyScalars (theOutline, theCopy);
	if (theOutline.subs !== undefined) {
		theCopy.subs = new Object ();
		copySubs (theOutline.subs, theCopy.subs)
		}
	return (theCopy);
	}
function outlineToCode (theOutline, pagetable, flProcessOldMacros) {
	var jstext = "", indentlevel = 0;
	function add (s) {
		jstext += filledString ("\t", indentlevel) + s + "\n";
		}
	function doLevel (head) {
		if (head.subs !== undefined) {
			for (var i = 0; i < head.subs.length; i++) {
				var sub = head.subs [i];
				if (!getBoolean (sub.iscomment)) { //opmlparser appears to unicase the names, so isComment becomes iscomment
					add (sub.text);
					if (sub.subs !== undefined) {
						indentlevel++;
						doLevel (sub);
						indentlevel--;
						}
					}
				}
			}
		}
	doLevel (theOutline);
	if (pagetable !== undefined) {
		jstext = multipleReplaceAll (jstext, pagetable, false, "[%", "%]");
		}
	if (flProcessOldMacros) {
		var oldmacros = new Object ();
		oldmacros.text = pagetable.text;
		oldmacros.systemstyles= '\t\t\t<link href="http://static.scripting.com/github/bootstrap2/css/bootstrap.css" rel="stylesheet">\n\t\t\t<link href="http://static.scripting.com/github/bootstrap2/css/prettify.css" rel="stylesheet">\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/jquery.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/prettify.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-transition.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-alert.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-modal.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-dropdown.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-scrollspy.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-tab.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-tooltip.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-popover.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-button.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-collapse.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-carousel.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-typeahead.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/application.js"></script>\n\t\t\t<script src="http://static.opml.org/scripts.js"></script>\n\t\t\t<link href="http://static.opml.org/styles.css" rel="stylesheet">\n\t\t\t';
		jstext = multipleReplaceAll (jstext, oldmacros, false, "<" + "%", "%" + ">");
		
		}
	return (jstext);
	}
function outlineToIndex (theOutline, callback) {
	var htmltext = "", indentlevel = 0;
	function add (s) {
		htmltext += filledString ("\t", indentlevel) + s + "\n";
		}
	function inlevelcallback () {
		add ("<ul>"); indentlevel++;
		return (true);
		}
	function outlevelcallback () {
		add ("</ul>"); indentlevel--;
		}
	function nodecallback (theNode, path) {
		if (typeIsDoc (theNode)) {
			add ("<li><a href=\"" + path + "\">" + theNode.text + "</a></li>");
			}
		else {
			var type = getNodeType (theNode);
			switch (type) {
				case "link":
					add ("<li><a href=\"" + theNode.url + "\">" + theNode.text + "</a></li>");
					break;
				default:
					add ("<li>" + theNode.text + "</li>");
					break;
				}
			}
		}
	outlineVisiter (theOutline, inlevelcallback, outlevelcallback, nodecallback, function () {
		callback (htmltext);
		});
	}
function outlineVisiter (theOutline, inlevelcallback, outlevelcallback, nodecallback, visitcompletecallback) {
	function doLevel (head, path, levelcompletecallback) {
		function doOneSub (head, ixsub) {
			if ((head.subs !== undefined) && (ixsub < head.subs.length)) {
				var sub = head.subs [ixsub], subpath = path + getNameAtt (sub);
				if (!getBoolean (sub.iscomment)) { 
					if ((sub.type == "include") && (!typeIsDoc (sub))) {
						nodecallback (sub, subpath);
						readInclude (sub, function (theIncludedOutline) {
							if (theIncludedOutline !== undefined) {
								doLevel (theIncludedOutline, subpath + "/", function () { 
									outlevelcallback ();
									doOneSub (head, ixsub +1);
									});
								}
							});
						}
					else {
						if (typeIsDoc (sub)) {
							if (sub.type == "index") {
								subpath += "/";
								}
							nodecallback (sub, subpath);
							doOneSub (head, ixsub +1);
							}
						else {
							nodecallback (sub, subpath);
							if (sub.subs !== undefined) {
								doLevel (sub, subpath + "/", function () { 
									outlevelcallback ();
									doOneSub (head, ixsub +1);
									});
								}
							else {
								doOneSub (head, ixsub +1);
								}
							}
						}
					}
				else {
					doOneSub (head, ixsub +1);
					}
				}
			else {
				levelcompletecallback ();
				}
			}
		inlevelcallback ();
		if (head.type == "include") {
			readInclude (head, function (theIncludedOutline) {
				if (theIncludedOutline !== undefined) {
					doOneSub (theIncludedOutline, 0);
					}
				});
			}
		else {
			doOneSub (head, 0);
			}
		}
	doLevel (theOutline, "", function () {
		outlevelcallback ();
		visitcompletecallback ();
		});
	}
function expandIncludes (theOutline, callback) {
	var theNewOutline = new Object (), lastNewNode = theNewOutline, stack = new Array (), currentOutline;
	function inlevelcallback () {
		stack [stack.length] = currentOutline;
		currentOutline = lastNewNode;
		if (currentOutline.subs === undefined) {
			currentOutline.subs = new Array ();
			}
		}
	function nodecallback (theNode, path) {
		var newNode = new Object ();
		copyScalars (theNode, newNode);
		currentOutline.subs [currentOutline.subs.length] = newNode;
		lastNewNode = newNode;
		}
	function outlevelcallback () {
		currentOutline = stack [stack.length - 1];
		stack.length--; //pop the stack
		}
	outlineVisiter (theOutline, inlevelcallback, outlevelcallback, nodecallback, function () {
		callback (theNewOutline);
		});
	}
function httpReadUrl (url, callback) {
	request (url, function (error, response, body) {
		if (!error && (response.statusCode == 200)) {
			callback (body) 
			}
		});
	}
function getIcon (idnum, flcollapsed) {
	var wedgedir, color;
	if (flcollapsed) {
		wedgedir = "right";
		color = "black";
		}
	else {
		wedgedir = "down";
		color = "silver";
		}
	
	var clickscript = "onclick=\"ecOutline (" + idnum + ")\" ";
	var icon = "<span class=\"spOutlineIcon\"><a class=\"aOutlineWedgeLink\" " + clickscript + "><i class=\"fa fa-caret-" + wedgedir + "\" style=\"color: " + color + ";\" id=\"idOutlineWedge" + idnum + "\"></i></a></span>";
	return (icon);
	}
function expandableTextLink (theText, idLevel) {
	return ("<a class=\"aOutlineTextLink\" onclick=\"ecOutline (" + idLevel + ")\">" + theText + "</a>");
	}
function riverGetPermalinkString (urlPermalink, permalinkString) {
	if (urlPermalink == undefined) {
		return ("");
		}
	if (permalinkString == undefined) { 
		permalinkString = "#";
		}
	return ("<div class=\"divOutlinePermalink\"><a href=\"" + urlPermalink + "\">" + permalinkString + "</a></div>");
	}
function riverRenderOutline (outline, flMarkdown, urlPermalink, permalinkString, flExpanded) {
	var htmltext = "", indentlevel = 0, permalink = riverGetPermalinkString (urlPermalink, permalinkString), outlinelevel = 0;
	if (flMarkdown === undefined) {
		flMarkdown = false;
		}
	if (flExpanded === undefined) { //10/23/14 by DW
		flExpanded = riverConfig.flOutlinesExpandedByDefault; //4/16/15 by DW
		}
	function add (s) {
		htmltext += filledString ("\t", indentlevel) + s + "\r\n";
		}
	function getHotText (outline) {
		var origtext = outline.text;
		return (expandableTextLink (origtext, serialnumForRiverRender)); //5/7/15 by DW
		}
	function hasSubs (outline) {
		return (outline.subs != undefined) && (outline.subs.length > 0);
		}
	function getImgHtml (imgatt) { //4/28/15 by DW
		if (imgatt === undefined) {
			return ("");
			}
		else {
			return ("<img style=\"float: right; margin-left: 24px; margin-top: 14px; margin-right: 14px; margin-bottom: 14px;\" src=\"" + imgatt +"\">");
			}
		}
	function gatherStylesFromOutline (outline) { //11/5/14 by DW
		var atts = new Object (), styles = new Object ();
		for (var x in outline) {
			switch (x) {
				case "color":
				case "direction":
				case "font-family":
				case "font-size":
				case "font-weight":
				case "letter-spacing":
				case "line-height":
				case "margin-left":
				case "text-decoration":
				case "text-shadow":
				case "text-transform":
				case "white-space":
				case "word-spacing":
					styles [x] = outline [x];
					break;
				}
			}
		return (styles);
		}
	function getStylesString (outline, flcollapsed) { //11/7/14 by DW
		var styles = gatherStylesFromOutline (outline), style = "";
		if (flcollapsed) {
			styles.display = "none";
			}
		for (var x in styles) {
			style += x + ": " + styles [x] + "; ";
			}
		if (style.length > 0) {
			style = " style=\"" + style + "\"";
			}
		return (style);
		}
	function getSubsMarkdownText (outline) {
		var s = "", style = getStylesString (outline, false);
		for (var i = 0; i < outline.subs.length; i++) {
			var child = outline.subs [i], img = "", imgatt = $(child).attr ("img");
			
			if (!getBoolean (child.isComment)) { //5/2/15 by DW
				s += getImgHtml (imgatt) + child.text + "\r\r";
				if (hasSubs (child)) {
					s += getSubsMarkdownText (child);
					}
				}
			
			}
		return (s);
		}
	function addChildlessSub (theNode, path) { //5/20/15 by DW
		if (typeIsDoc (theNode)) {
			add ("<li><div class=\"divOutlineText\"><a href=\"" + path + "\">" + theNode.text + "</a></div></li>");
			}
		else {
			var type = getNodeType (theNode);
			switch (type) {
				case "link":
					add ("<li><div class=\"divOutlineText\"><a href=\"" + theNode.url + "\">" + theNode.text + "</a></div></li>");
					break;
				default:
					add ("<li><div class=\"divOutlineText\">" + theNode.text + "</div></li>");
					break;
				}
			}
		}
	function addSubs (outline, flcollapsed, path) {
		if (hasSubs (outline)) {
			var style = getStylesString (outline, flcollapsed);
			add ("<ul class=\"ulOutlineList ulLevel" + outlinelevel + "\" id=\"idOutlineLevel" + serialnumForRiverRender++ + "\"" + style + ">"); indentlevel++; outlinelevel++;
			for (var i = 0; i < outline.subs.length; i++) {
				var child = outline.subs [i], flchildcollapsed = getBoolean (child.collapse), img = getImgHtml (child.img);
				if (!beginsWith (child.text, "<rule")) { //5/28/15 by DW
					if (!getBoolean (child.isComment)) { //5/2/15 by DW
						var childpath = path + getNameAtt (child); //5/20/15 by DW
						if (hasSubs (child)) {
							add ("<li>"); indentlevel++;
							add ("<div class=\"divOutlineText\">" + getIcon (serialnumForRiverRender, flchildcollapsed) + img + getHotText (child) + "</div>");
							addSubs (child, flchildcollapsed, childpath + "/");
							add ("</li>"); indentlevel--;
							}
						else {
							addChildlessSub (child, childpath);
							}
						}
					}
				}
			add ("</ul>"); indentlevel--; outlinelevel--;
			}
		}
	
	
	if (hasSubs (outline)) { //9/22/14 by DW
		var flTopLevelCollapsed = !flExpanded, theText = getHotText (outline);
		add ("<div class=\"divRenderedOutline\">"); indentlevel++;
		add ("<div class=\"divItemHeader divOutlineHead divOutlineHeadHasSubs\">" + getIcon (serialnumForRiverRender, flTopLevelCollapsed) + theText + permalink + "</div>");
		
		if (flMarkdown) {
			var markdowntext = getSubsMarkdownText (outline), style = "";
			if (flTopLevelCollapsed) { //10/23/14 by DW
				style = " style=\"display: none;\"";
				}
			var opendiv = "<div class=\"divMarkdownSubs\" id=\"idOutlineLevel" + serialnumForRiverRender++ + "\" " + style + ">";
			add (opendiv + marked (markdowntext) + "</div>");
			}
		else {
			add ("<div class=\"divOutlineSubs\">"); indentlevel++;
			addSubs (outline, flTopLevelCollapsed, "");
			add ("</div>"); indentlevel--;
			}
		
		add ("</div>"); indentlevel--;
		
		serialnumForRiverRender++; //9/22/14 by DW
		}
	else {
		add ("<div class=\"divRenderedOutline\">"); indentlevel++;
		add ("<div class=\"divItemHeader divOutlineHead\">" + hotUpText (outline.text, outline.url) + permalink + "</div>");
		add ("</div>"); indentlevel--;
		}
	
	return (htmltext);
	}
function renderThumblist (theOutline) {
	var htmltext = "", indentlevel = 0, ctinrow = 0, maxinrow = 4, flnewrow = true, created, datestring, colwidth, caption, image, tw;
	function add (s) {
		htmltext += filledString ("\t", indentlevel) + s + "\n";
		}
	add ("<table>"); indentlevel++;
	for (var i = 0; i < theOutline.subs.length; i++) {
		var theNode = theOutline.subs [i];
		if (flnewrow) {
			add ("<tr>"); indentlevel++;
			flnewrow = false;
			}
		
		//set datestring
			created = new Date (theNode.created);
			datestring = (created.getMonth () + 1) + "/" + created.getDate ();
		//set colwidth
			tw = Number (theNode.thumbwidth);
			colwidth = tw + ((2 * tw) / 3);
		//set caption
			caption = "<div class=\"thumbListCaptionString\">" + datestring + ": " + theNode.text + "</div>";
		//set image
			image = "<a href=\"" + innerCaseName (theNode.text) + "\"><img src=\"" + theNode.thumburl + "\" width=\"" + theNode.thumbwidth + "\" height=\"" + theNode.thumbheight + "\" alt=\"" + theNode.text + "\" border=\"0\"></a>"
		
		add ("<td width=\"" + colwidth + "\">" + image + caption + "</td>");
		ctinrow++;
		if (ctinrow >= maxinrow) {
			add ("</tr>"); indentlevel--;
			ctinrow = 0;
			flnewrow = true;
			}
		}
	if (ctinrow > 0) {
		add ("</tr>"); indentlevel--;
		}
	add ("</table>"); indentlevel--;
	return (htmltext);
	}
function findDomain (theOutline, domain, callback) {
	var lowerdomain = stringLower (domain), flfound = false;
	function findin (theNode) {
		if (theNode.domain !== undefined) {
			if (stringLower (theNode.domain) == lowerdomain) {
				callback (theNode);
				flfound = true;
				return;
				}
			}
		if (theNode.subs !== undefined) {
			for (var i = 0; i < theNode.subs.length; i++) {
				findin (theNode.subs [i]);
				}
			}
		}
	findin (theOutline);
	if (!flfound) {
		callback (theOutline);
		}
	}
function buildDomainsTable (callback) {
	var domains = new Object ();
	function doNext (ixnext) {
		if (ixnext < appConfig.roots.length) {
			var urlOutline = appConfig.roots [ixnext].url;
			console.log ("buildDomainsTable: urlOutline == " + urlOutline);
			readOpml (urlOutline, function (theOutline) {
				function visitNode (theNode) {
					if (theNode.domain !== undefined) {
						domains [theNode.domain] = urlOutline;
						}
					if ((theNode.type === undefined) || (theNode.type != "include")) {
						if (theNode.subs !== undefined) {
							for (var i = 0; i < theNode.subs.length; i++) {
								visitNode (theNode.subs [i]);
								}
							}
						}
					}
				visitNode (theOutline);
				doNext (ixnext + 1);
				});
			}
		else {
			if (callback !== undefined) {
				globalDomains = domains;
				callback (domains);
				}
			}
		}
	doNext (0);
	}
function get404page (callback) {
	request (appConfig.url404Page, function (error, response, body) {
		if (!error && (response.statusCode == 200)) {
			callback (body, "text/html");
			}
		else {
			callback ("Not found.", "text/plain");
			}
		});
	}
function isNameAvailable (theName) {
	
	return ("isNameAvailable: theName == " + theName);
	
	function sendStringBack (s) {
		var x = {"message": s};
		statsAddToHttpLog (httpRequest, undefined, undefined, now); 
		httpResponse.end ("getData (" + JSON.stringify (x) + ")");    
		}
	httpResponse.writeHead (200, {"Content-Type": "application/json", "Access-Control-Allow-Origin": "fargo.io"});
	var name = cleanName (parsedUrl.query.name);
	if (name.length == 0) {
		sendStringBack ("");    
		}
	else {
		if (name.length < 4) {
			sendStringBack ("Name must be 4 or more characters.");
			}
		else {
			isNameDefined (name, function (fldefined) {
				var color, answer;
				if (fldefined) {
					color = "red";
					answer = "is not";
					}
				else {
					color = "green";
					answer = "is";
					}
				sendStringBack ("<span style=\"color: " + color + ";\">" + name + "." + myDomain + " " + answer + " available.</span>")
				});
			}
		}
	}

function handleSystemRequest (lowerpath, parsedUrl, callback) {
	switch (lowerpath) {
		case "/version":
			callback (200, {"Content-Type": "text/plain"}, myVersion);
			break;
		case "/now":
			callback (200, {"Content-Type": "text/plain"}, new Date ().toString ());
			break;
		case "/loaddomains": //5/27/15 by DW
			buildDomainsTable (function (domains) {
				console.log (jsonStringify (domains));    
				callback (200, {"Content-Type": "text/plain"}, jsonStringify (domains));
				});
			break;
		case "/favicon.ico":  //5/27/15 by DW
			callback (302, {"location": appConfig.urlFavicon}, "302 REDIRECT");
			break;
		case "/robots.txt":  //5/27/15 by DW
			callback (200, {"Content-Type": "text/plain"}, appConfig.robotsTxt);
			break;
		case "/stats.json":  //7/8/15 by DW
			callback (200, {"Content-Type": "application/json"}, jsonStringify (worldOutlineStats));
			break;
		case "/isnameavailable": //7/11/15 by DW
			callback (200, {"Content-Type": "text/html"}, isNameAvailable (parsedUrl.query.name));
			break;
		default: 
			get404page (function (s, type) {
				callback (404, {"Content-Type": type}, s);
				});
			break;
		}
	}

function worldOutline (urlOutline, domain, path, parsedUrl, callback) {
	var thisPageUrl;
	
	function return404 () {
		
		get404page (function (s, type) {
			callback (404, {"Content-Type": type}, s);
			});
		
		}
	function return500 (s) {
		callback (500, {"Content-Type": "text/plain"}, s);
		}
	function returnRedirect (url) {
		callback (302, {"location": url}, "302 REDIRECT");
		}
	function returnHtml (htmltext) {
		callback (200, {"Content-Type": "text/html"}, htmltext);
		}
	function getTemplate (type) {
		var urlTemplate = appConfig.templates [type];
		if (urlTemplate === undefined) {
			urlTemplate = appConfig.templates.default;
			}
		return (urlTemplate);
		}
	function getDisqusGroup (urlOutline) {
		for (var i = 0; i < appConfig.roots.length; i++) {
			var theRoot = appConfig.roots [i];
			if (theRoot.url == urlOutline) {
				return (theRoot.disqusGroup);
				}
			}
		return (appConfig.disqusGroupname);
		}
	
	//set thisPageUrl
		var thisPort;
		if (appConfig.port == 80) {
			thisPort = "";
			}
		else {
			thisPort = ":" + appConfig.port;
			}
		var thisPageUrl = "http://" + domain + thisPort + path;
	
	readOpml (urlOutline, function (theOutline, err) {
		if (err) {
			return500 (err.message);
			}
		else {
			findDomain (theOutline, domain, function (domainOutline) {
				var steps = stringLower (path).split ("/"), theStep;
				var ixFirstStep = 0, ixLastStep = steps.length - 1, htmltext, pagetable = new Object ();
				function nextStep (ixstep, nomad, callback) {
					function loopOverSubs (nomad) {
						var subs = nomad.subs;
						if (subs === undefined) {
							callback (false);
							}
						else {
							for (var j = 0; j < subs.length; j++) {
								var sub = subs [j], nameatt = stringLower (getNameAtt (sub));
								if (nameatt == theStep) {
									nextStep (ixstep + 1, sub, callback);
									return;
									}
								}
							callback (false);
							}
						}
					if (ixstep <= ixLastStep) {
						var theStep = steps [ixstep];
						if ((nomad.type == "include") || (nomad.type == "thumbList")) {
							if (nomad.url !== undefined) {
								readInclude (nomad, function (theIncludedOutline) {
									if (theIncludedOutline !== undefined) {
										loopOverSubs (theIncludedOutline);
										}
									});
								}
							else {
								console.log ("include node with no url attribute at step == " + theStep);
								callback (false);
								}
							}
						else {
							loopOverSubs (nomad);
							
							}
						}
					else {
						callback (true, nomad);
						}
					}
				if (steps [0].length == 0) {
					ixFirstStep = 1;
					}
				if (steps [ixLastStep].length == 0) {
					ixLastStep--;
					}
				nextStep (ixFirstStep, domainOutline, function (flfound, nomad) {
					
					function renderOutline (nomad) {
						expandIncludes (nomad, function (expandedOutline) {
							htmltext = riverRenderOutline (expandedOutline, false, undefined, undefined, true);
							nomad.thispageurl = thisPageUrl;
							
							nomad.disqusGroupname = getDisqusGroup (urlOutline);
							
							renderThroughTemplate (htmltext, nomad, urlTemplate, httpReadUrl, function (s) {
								returnHtml (s);
								});
							});
						}
					function renderPresentation (nomad) { 
						expandIncludes (nomad, function (theOutline) {
							var htmltext = "", indentlevel = 0;
							function add (s) {
								htmltext += filledString ("\t", indentlevel) + s + "\n";
								}
							for (var i = 0; i < theOutline.subs.length; i++) {
								var theNode = theOutline.subs [i];
								function dolevel (theNode) {
									if (theNode.subs !== undefined) {
										add ("<ul>"); indentlevel++
										for (var i = 0; i < theNode.subs.length; i++) {
											var theSub = theNode.subs [i];
											add ("<li>" + theSub.text + "</li>")
											dolevel (theSub)
											}
										add ("</ul>"); indentlevel--
										}
									}
								add ("<section>"); indentlevel++
								add ("<h2>" + theNode.text + "</h2>")
								dolevel (theNode)
								add ("</section>"); indentlevel--
								}
							
							if (nomad.theme === undefined) {
								nomad.theme = "default";
								}
							if (nomad.transition === undefined) {
								nomad.transition = "default";
								}
							renderThroughTemplate (htmltext, nomad, urlTemplate, httpReadUrl, function (s) {
								returnHtml (s);
								});
							});
						}
					function renderIndex (nomad) { 
						function dosubs (theOutline) {
							var htmltext = "", indentlevel = 0;
							function add (s) {
								htmltext += filledString ("\t", indentlevel) + s + "\n";
								}
							if (theOutline.subs !== undefined) {
								add ("<ul class=\"ulIndexList\">"); indentlevel++;
								for (var i = 0; i < theOutline.subs.length; i++) {
									var theSub = theOutline.subs [i];
									if (theSub.subs !== undefined) {
										add ("<li><a href=\"" + getNameAtt (theSub) + "\">" + theSub.text + "</a></li>");
										}
									else {
										var theType = stringLower (theSub.type);
										switch (theType) {
											case "include": case "thumblist": case "photo": case "redirect":
												add ("<li><a href=\"" + getNameAtt (theSub) + "\">" + theSub.text + "</a></li>");
												break;
											case "link":
												add ("<li><a href=\"" + theSub.url + "\">" + theSub.text + "</a></li>");
												break;
											default:
												add ("<li>" + theSub.text + "</li>");
												break;
											}
										}
									}
								add ("</ul>"); indentlevel--;
								}
							renderThroughTemplate (htmltext, nomad, urlTemplate, httpReadUrl, function (s) {
								returnHtml (s);
								});
							}
						if (nomad.type == "include") {
							if (nomad.url !== undefined) {
								readInclude (nomad, function (theIncludedOutline) {
									if (theIncludedOutline !== undefined) {
										dosubs (theIncludedOutline);
										}
									});
								}
							else {
								console.log ("include node with no url attribute at step == " + theStep);
								callback (false);
								}
							}
						else {
							dosubs (nomad);
							}
						}
					function renderPhoto (theOutline) { //7/9/15 by DW
						renderThroughTemplate ("", nomad, urlTemplate, httpReadUrl, function (s) {
							returnHtml (s);
							});
						}
					
					if (flfound) {
						var theType = stringLower (getNodeType (nomad)), urlTemplate = getTemplate (theType);
						nomad.urlOutline = urlOutline; //so it gets into the pagetable -- 7/10/15 by DW
						
						
						switch (theType) {
							case "outline": case "howto":  case "blogpost":  case "thread":
								renderOutline (nomad);
								break;
							case "presentation":
								renderPresentation (nomad);
								break;
							case "photo":
								renderPhoto (nomad);
								break;
							case "thumblist":
								if (endsWith (path, "/")) {
									readOpml (nomad.url, function (theOutline, err) {
										if (err) {
											return500 (err.message);
											}
										else {
											htmltext = renderThumblist (theOutline);
											
											nomad.thispageurl = thisPageUrl;
											
											renderThroughTemplate (htmltext, nomad, urlTemplate, httpReadUrl, function (s) {
												returnHtml (s);
												});
											}
										});
									}
								else {
									returnRedirect (path + "/");
									}
								break;
							case "code":
								callback (200, {"Content-Type": "application/javascript"}, outlineToCode (nomad));
								break;
							case "html":
								gatherTemplateAtts (nomad, pagetable);
								returnHtml (outlineToCode (nomad, pagetable, true));
								break;
							case "redirect": 
								returnRedirect (nomad.url);
								break;
							case "index": default:
								if (endsWith (path, "/")) {
									renderIndex (nomad);
									}
								else {
									returnRedirect (path + "/");
									}
								break;
							}
						}
					else {
						handleSystemRequest (path, parsedUrl, callback);
						}
					});
				});
			}
		});
	}
function handleRequest (httpRequest, httpResponse) {
	function writeHead (type) {
		if (type == undefined) {
			type = "text/plain";
			}
		httpResponse.writeHead (200, {"Content-Type": type, "Access-Control-Allow-Origin": "*"});
		}
	function return404 () {
		get404page (function (s, type) {
			httpResponse.writeHead (404, {"Content-Type": type, "Access-Control-Allow-Origin": "*"});
			httpResponse.end (s);    
			});
		}
	function returnRedirect (url) {
		httpResponse.writeHead (302, {"location": url});
		httpResponse.end ("Redirect to this URL: " + url);
		}
	function respondWithObject (obj) {
		writeHead ("application/json");
		httpResponse.end (jsonStringify (obj));    
		}
	function findDomainOutline (host, callback) { //determines which outline contains the indicated host
		var lowerhost = stringLower (host);
		for (var x in globalDomains) {
			if (stringLower (x) == lowerhost) {
				callback (globalDomains [x]);
				return;
				}
			}
		callback (undefined);
		}
	try {
		var parsedUrl = urlpack.parse (httpRequest.url, true), now = new Date (), startTime = now;
		var lowerpath = parsedUrl.pathname.toLowerCase (), host, port = 80, flLocalRequest = false, lowerhost;
		
		//set host, port, flLocalRequest
			host = httpRequest.headers.host;
			if (stringContains (host, ":")) {
				port = stringNthField (host, ":", 2);
				host = stringNthField (host, ":", 1);
				}
			flLocalRequest = beginsWith (host, "localhost");
			lowerhost = host.toLowerCase ();
		
		logRequest (httpRequest);
		
		//stats
			//hits today
				if (!sameDay (now, worldOutlineStats.whenLastHit)) { //day rollover
					worldOutlineStats.ctHitsToday = 0;
					worldOutlineStats.hitsByDomainToday = {};
					worldOutlineStats.hitsByUrlToday = {};
					}
			worldOutlineStats.ctHits++;
			worldOutlineStats.whenLastHit = now;
			worldOutlineStats.ctHitsToday++;
			flStatsDirty = true;
		
		switch (httpRequest.method) {
			case "GET":
				findDomainOutline (host, function (urlOutline) {
					if (urlOutline === undefined) { //not one of our domains
						handleSystemRequest (lowerpath, parsedUrl, function (code, headers, htmltext) {
							if (headers === undefined) {
								headers = new Object ();
								}
							headers ["Access-Control-Allow-Origin"] = "*";
							httpResponse.writeHead (code, headers);
							httpResponse.end (htmltext);
							});
						}
					else {
						//hits by domain, for all time, and for today
							if (worldOutlineStats.hitsByDomain [lowerhost] == undefined) {
								worldOutlineStats.hitsByDomain [lowerhost] = 1;
								}
							else {
								worldOutlineStats.hitsByDomain [lowerhost]++;
								}
							
							if (worldOutlineStats.hitsByDomainToday [lowerhost] == undefined) { //7/8/15 by DW
								worldOutlineStats.hitsByDomainToday [lowerhost] = 1;
								}
							else {
								worldOutlineStats.hitsByDomainToday [lowerhost]++;
								}
							
							var urltocount = "http://" + lowerhost + lowerpath;
							if (worldOutlineStats.hitsByUrlToday [urltocount] == undefined) { //7/9/15 by DW
								worldOutlineStats.hitsByUrlToday [urltocount] = 1;
								}
							else {
								worldOutlineStats.hitsByUrlToday [urltocount]++;
								}
							
							flStatsDirty = true;
						worldOutline (urlOutline, host, lowerpath, parsedUrl, function (code, headers, htmltext) {
							if (headers === undefined) {
								headers = new Object ();
								}
							headers ["Access-Control-Allow-Origin"] = "*";
							httpResponse.writeHead (code, headers);
							httpResponse.end (htmltext);
							if (code == 200) {
								saveRenderedPage (host, lowerpath, htmltext);
								}
							});
						}
					});
				break;
			}
		}
	catch (tryError) {
		httpResponse.writeHead (503, {"Content-Type": "text/plain", "Access-Control-Allow-Origin": "*"});
		httpResponse.end (tryError.message);    
		console.log ("handleRequest: tryError.message == " + tryError.message);
		}
	}
function loadConfig (callback) { 
	fs.readFile (configFname, function (err, data) {
		if (!err) {
			var storedConfig = JSON.parse (data.toString ());
			console.log ("loadConfig: config == " + jsonStringify (storedConfig)); //xxx
			for (var x in storedConfig) {
				appConfig [x] = storedConfig [x];
				}
			}
		if (callback !== undefined) {
			callback ();
			}
		});
	}
function everyMinute () {
	outlineCache = new Object ();
	if (flStatsDirty) {
		flStatsDirty = false;
		worldOutlineStats.ctWriteStats++;
		worldOutlineStats.whenLastWriteStats = new Date ();
		writeStats (fnameStats, worldOutlineStats);
		}
	}
function startup () {
	loadConfig (function () {
		readStats (fnameStats, worldOutlineStats, function () {
			
			worldOutlineStats.ctStarts++;
			worldOutlineStats.whenLastStart = new Date ();
			flStatsDirty = true;
			
			buildDomainsTable (function (domains) {
				console.log ("buildDomainsTable: domains == " + jsonStringify (domains));
				
				console.log ("\n" + myProductName + " v" + myVersion + " running on port " + appConfig.port + ".\n");
				http.createServer (handleRequest).listen (appConfig.port);
				
				setInterval (everyMinute, 60000); 
				});
			});
		});
	}
startup ();
