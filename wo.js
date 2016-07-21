var myVersion = "0.49g", myProductName = "World Outline"; 
var fs = require ("fs");
var request = require ("request");
var opmlParser = require ("opmlparser");
var http = require ("http"); 
var https = require ("https");
var urlpack = require ("url");
var marked = require ("marked");
var strftime = require ("strftime");
var dns = require ("dns");
var utils = require ("./lib/utils.js"); //7/15/15 by DW
var opml = require ("./lib/opml.js"); //7/15/15 by DW

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

var outlineCache = new Object (), maxCacheSecs = 15;

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
		utils.copyScalars (theNode, allTheAtts);
		if (theNode.path !== undefined) {
			thisfilepath = trimWhitespace (theNode.path);
			if (utils.endsWith (thisfilepath, "/")) {
				thisfilepath = utils.stringMid (thisfilepath, 1, thisfilepath.length - 1);
				}
			if (utils.beginsWith (thisfilepath, "/")) {
				thisfilepath = utils.stringDelete (thisfilepath, 1, 1);
				}
			}
		else {
			if (theNode.name === undefined) {
				theNode.name = utils.innerCaseName (theNode.text); 
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
	
	console.log ("gatherTemplateAtts: allTheAtts == " + utils.jsonStringify (allTheAtts)); //7/16/16 by DW
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
				return (utils.stripMarkup (theOutline.subs [0].text));
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
		
		s = utils.replaceAll (s, "[%disqusgroupname%]", groupname);
		return (s);
		}
	gatherTemplateAtts (theNode, pagetable);
	
	if (utils.beginsWith (pagetable.title, "system.temp.op.netOutlines")) { //5/28/15 by DW
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
			if ((pagetable.title === undefined) || (pagetable.title.length == 0)) {
				pagetable.pagetitle = pagetable.text;
				}
			else {
				pagetable.pagetitle = pagetable.text; //7/14/15 by DW
				}
		pagetable.urlstyles = templateConfig.urlDefaultTemplateStyles;
		pagetable.urlscripts = templateConfig.urlDefaultTemplateScripts;
		pagetable.when = new Date (pagetable.created);
		
		//set postDate -- 7/16/16 AM by DW
			(function () {
				var when = pagetable.whenModified;
				if (when === undefined) {
					when = pagetable.when;
					}
				if (when === undefined) {
					pagetable.postDate = "not specified";
					}
				else {
					console.log ("renderThroughTemplate: when == " + when);
					when = new Date (when);
					pagetable.postDate = strftime ("%a, %b %e, %Y at %l:%M %p", when);
					}
				}) ();
		
		pagetable.siteName = pagetable.title;
		pagetable.flFromEditor = true;
		pagetable.ogtitle = pagetable.text;
		pagetable.authorname = pagetable.ownername;
		pagetable.ogdescription = getPostDescription (theNode);
		pagetable.ogimage = getPostImage ();
		pagetable.urlTemplate = urlTemplate; //1/16/16 by DW
		
		
		
		pagetable.pagetableinjson = utils.jsonStringify (pagetable);
		pagetable.theoutline = utils.jsonStringify (outlineToJstruct (theNode)); //7/9/15 by DW
		pagetable.comments = getCommentHtml ();
		pagetable.bodytext = bodytext;
		htmltext = utils.multipleReplaceAll (templatetext, pagetable, false, "[%", "%]");
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
	if (utils.stringContains (host, ":")) {
		port = utils.stringNthField (host, ":", 2);
		host = utils.stringNthField (host, ":", 1);
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
	fs.writeFile (f, utils.jsonStringify (stats), function (err) {
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
	if (utils.endsWith (lowerpath, "/")) {
		lowerpath += "index.html";
		}
	f = renderedPagesFolder + utils.stringLower (host) + lowerpath;
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
						linetext = utils.stringMid (linetext, 1, 50) + "...";
						}
				theText += utils.filledString ("\t", indentlevel) + linetext + attstext + "\n";
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
	utils.copyScalars (theOutline, theCopy);
	if (theOutline.subs !== undefined) {
		theCopy.subs = new Object ();
		copySubs (theOutline.subs, theCopy.subs)
		}
	return (theCopy);
	}
function outlineToCode (theOutline, pagetable, flProcessOldMacros) {
	var jstext = "", indentlevel = 0;
	function add (s) {
		jstext += utils.filledString ("\t", indentlevel) + s + "\n";
		}
	function doLevel (head) {
		if (head.subs !== undefined) {
			for (var i = 0; i < head.subs.length; i++) {
				var sub = head.subs [i];
				if (!utils.getBoolean (sub.iscomment)) { //opmlparser appears to unicase the names, so isComment becomes iscomment
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
		jstext = utils.multipleReplaceAll (jstext, pagetable, false, "[%", "%]");
		}
	if (flProcessOldMacros) {
		var oldmacros = new Object ();
		oldmacros.text = pagetable.text;
		oldmacros.systemstyles= '\t\t\t<link href="http://static.scripting.com/github/bootstrap2/css/bootstrap.css" rel="stylesheet">\n\t\t\t<link href="http://static.scripting.com/github/bootstrap2/css/prettify.css" rel="stylesheet">\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/jquery.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/prettify.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-transition.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-alert.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-modal.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-dropdown.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-scrollspy.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-tab.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-tooltip.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-popover.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-button.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-collapse.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-carousel.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/bootstrap-typeahead.js"></script>\n\t\t\t<script src="http://static.scripting.com/github/bootstrap2/js/application.js"></script>\n\t\t\t<script src="http://static.opml.org/scripts.js"></script>\n\t\t\t<link href="http://static.opml.org/styles.css" rel="stylesheet">\n\t\t\t';
		jstext = utils.multipleReplaceAll (jstext, oldmacros, false, "<" + "%", "%" + ">");
		
		}
	return (jstext);
	}
function getNameAtt (theNode) {
	var nameatt = theNode.name;
	if (nameatt === undefined) {
		nameatt = utils.innerCaseName (theNode.text);
		}
	return (nameatt);
	}
function outlineToIndex (theOutline, callback) {
	var htmltext = "", indentlevel = 0;
	function add (s) {
		htmltext += utils.filledString ("\t", indentlevel) + s + "\n";
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
	opml.outlineVisiter (theOutline, inlevelcallback, outlevelcallback, nodecallback, function () {
		callback (htmltext);
		});
	}

function readOpmlWithCache (url, callback) { //7/19/16 by DW
	function copyOutline (theOutline) {
		var newOutline = new Object ();
		utils.copyScalars (theOutline, newOutline);
		if (theOutline.subs !== undefined) {
			newOutline.subs = new Array ();
			for (var i = 0; i < theOutline.subs.length; i++) {
				newOutline.subs [i] = copyOutline (theOutline.subs [i]);
				}
			}
		return (newOutline);
		}
	var now = new Date ();
	if (outlineCache [url] !== undefined) {
		var item = outlineCache [url];
		if (utils.secondsSince (item.whenCached) < maxCacheSecs) {
			item.ctAccesses++;
			console.log ("readOpmlWithCache: using item from cache, url == " + url + ", item.ctAccesses == " + item.ctAccesses);
			callback (copyOutline (item.theOutline));
			return;
			}
		else {
			console.log ("readOpmlWithCache: cache item expired, url == " + url);
			delete outlineCache [url];
			}
		}
	opml.readOpmlUrl (url, function (theOutline, err) {
		if (err) {
			callback (theOutline, err);
			}
		else {
			console.log ("readOpmlWithCache: adding item to cache, url == " + url);
			outlineCache [url] = {
				theOutline: theOutline,
				ctAccesses: 0,
				whenCached: now
				};
			callback (theOutline);
			}
		});
	}

function readInclude (theIncludeNode, callback) {
	console.log ("readInclude: url == " + theIncludeNode.url);
	readOpmlWithCache (theIncludeNode.url, function (theOutline, err) {
		if (err) {
			callback (undefined);
			}
		else {
			callback (theOutline);
			}
		}, false);
	}

function typeIsDoc (theNode) {
	var type = getNodeType (theNode);
	return ((type !== undefined) && (type != "include") && (type != "link") && (type != "tweet"));
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
		htmltext += utils.filledString ("\t", indentlevel) + s + "\r\n";
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
			
			if (!utils.getBoolean (child.isComment)) { //5/2/15 by DW
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
				var child = outline.subs [i], flchildcollapsed = utils.getBoolean (child.collapse), img = getImgHtml (child.img);
				if (!utils.beginsWith (child.text, "<rule")) { //5/28/15 by DW
					if (!utils.getBoolean (child.isComment)) { //5/2/15 by DW
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
		add ("<div class=\"divItemHeader divOutlineHead\">" + utils.hotUpText (outline.text, outline.url) + permalink + "</div>");
		add ("</div>"); indentlevel--;
		}
	
	return (htmltext);
	}
function renderThumblist (theOutline) {
	var htmltext = "", indentlevel = 0, ctinrow = 0, maxinrow = 4, flnewrow = true, created, datestring, colwidth, caption, image, tw;
	function add (s) {
		htmltext += utils.filledString ("\t", indentlevel) + s + "\n";
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
			image = "<a href=\"" + utils.innerCaseName (theNode.text) + "\"><img src=\"" + theNode.thumburl + "\" width=\"" + theNode.thumbwidth + "\" height=\"" + theNode.thumbheight + "\" alt=\"" + theNode.text + "\" border=\"0\"></a>"
		
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
	var lowerdomain = utils.stringLower (domain), flfound = false;
	function findin (theNode) {
		if (theNode.domain !== undefined) {
			if (utils.stringLower (theNode.domain) == lowerdomain) {
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
			opml.readOpmlUrl (urlOutline, function (theOutline) {
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
				}, false);
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
				console.log (utils.jsonStringify (domains));    
				callback (200, {"Content-Type": "text/plain"}, utils.jsonStringify (domains));
				});
			break;
		case "/favicon.ico":  //5/27/15 by DW
			callback (302, {"location": appConfig.urlFavicon}, "302 REDIRECT");
			break;
		case "/robots.txt":  //5/27/15 by DW
			callback (200, {"Content-Type": "text/plain"}, appConfig.robotsTxt);
			break;
		case "/stats.json":  //7/8/15 by DW
			callback (200, {"Content-Type": "application/json"}, utils.jsonStringify (worldOutlineStats));
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
	
	function outlineToOPML (theOutline, title) {
		var xmltext = "", indentlevel = 0;
		function add (s) {
			xmltext += utils.filledString ("\t", indentlevel) + s + "\n";
			}
		function dolevel (theNode) {
			var atts = "";
			for (var x in theNode) {
				if (x != "subs") {
					atts += " " + x + "=\"" + utils.encodeXml (theNode [x]) + "\"";
					}
				}
			if (theNode.subs === undefined) {
				add ("<outline" + atts + " />");
				}
			else {
				add ("<outline" + atts + " >"); indentlevel++;
				for (var i = 0; i < theNode.subs.length; i++) {
					dolevel (theNode.subs [i]);
					}
				add ("</outline>"); indentlevel--;
				}
			}
		if (title === undefined) {
			title = "outline";
			}
		add ("<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?>");
		add ("<opml version=\"2.0\">"); indentlevel++;
		add ("<head>"); indentlevel++;
		add ("<title>" + utils.encodeXml (title) + "</title>");
		add ("</head>"); indentlevel--;
		add ("<body>"); indentlevel++;
		
		dolevel (theOutline);
		
		add ("</body>"); indentlevel--;
		add ("</opml>"); indentlevel--;
		return (xmltext);
		}
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
	
	readOpmlWithCache (urlOutline, function (theOutline, err) { //7/19/16 by DW -- was opml.readOpmlUrl
		if (err) {
			return500 (err.message);
			}
		else {
			var theScalars = {}; //7/16/16 by DW -- debugging
			utils.copyScalars (theOutline, theScalars); //7/16/16 by DW -- debugging
			console.log ("worldOutline: theScalars == " + utils.jsonStringify (theScalars)); //7/16/16 by DW -- debugging
			
			var whenModified = theOutline.datemodified; //7/16/16 by DW
			
			findDomain (theOutline, domain, function (domainOutline) {
				var steps = utils.stringLower (path).split ("/"), theStep;
				var ixFirstStep = 0, ixLastStep = steps.length - 1, htmltext, pagetable = new Object ();
				function nextStep (ixstep, nomad, callback) {
					function loopOverSubs (nomad) {
						var subs = nomad.subs;
						if (subs === undefined) {
							callback (false);
							}
						else {
							for (var j = 0; j < subs.length; j++) {
								var sub = subs [j], nameatt = utils.stringLower (getNameAtt (sub));
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
						opml.expandIncludes (nomad, function (expandedOutline) {
							htmltext = riverRenderOutline (expandedOutline, false, undefined, undefined, true);
							nomad.thispageurl = thisPageUrl;
							nomad.disqusGroupname = getDisqusGroup (urlOutline);
							nomad.whenModified = whenModified; //7/16/16 by DW
							renderThroughTemplate (htmltext, nomad, urlTemplate, httpReadUrl, function (s) {
								returnHtml (s);
								});
							});
						}
					function renderPresentation (nomad) { 
						opml.expandIncludes (nomad, function (theOutline) {
							var htmltext = "", indentlevel = 0;
							function add (s) {
								htmltext += utils.filledString ("\t", indentlevel) + s + "\n";
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
								htmltext += utils.filledString ("\t", indentlevel) + s + "\n";
								}
							if (theOutline.subs !== undefined) {
								add ("<ul class=\"ulIndexList\">"); indentlevel++;
								for (var i = 0; i < theOutline.subs.length; i++) {
									var theSub = theOutline.subs [i];
									if (theSub.subs !== undefined) {
										add ("<li><a href=\"" + getNameAtt (theSub) + "\">" + theSub.text + "</a></li>");
										}
									else {
										var theType = utils.stringLower (theSub.type);
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
						var theType = utils.stringLower (getNodeType (nomad)), urlTemplate = getTemplate (theType);
						nomad.urlOutline = urlOutline; //so it gets into the pagetable -- 7/10/15 by DW
						
						if (parsedUrl.query.format !== undefined) { //1/17/16 by DW
							switch (utils.stringLower (parsedUrl.query.format)) {
								case "json": 
									callback (200, {"Content-Type": "application/json"}, utils.jsonStringify (nomad));
									break;
								case "opml": 
									callback (200, {"Content-Type": "text/xml"}, outlineToOPML (nomad));
									break;
								default:
									return500 ("Can't return the data because the format requested, " + parsedUrl.query.format + " is not supported.");
									break;
								}
							}
						else {
							
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
									if (utils.endsWith (path, "/")) {
										readOpmlWithCache (nomad.url, function (theOutline, err) {
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
											}, false);
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
									if (utils.endsWith (path, "/")) {
										renderIndex (nomad);
										}
									else {
										returnRedirect (path + "/");
										}
									break;
								}
							}
						}
					else {
						handleSystemRequest (path, parsedUrl, callback);
						}
					});
				});
			}
		}, false);
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
		httpResponse.end (utils.jsonStringify (obj));    
		}
	function findDomainOutline (host, callback) { //determines which outline contains the indicated host
		var lowerhost = utils.stringLower (host);
		for (var x in globalDomains) {
			if (utils.stringLower (x) == lowerhost) {
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
			if (utils.stringContains (host, ":")) {
				port = utils.stringNthField (host, ":", 2);
				host = utils.stringNthField (host, ":", 1);
				}
			flLocalRequest = utils.beginsWith (host, "localhost");
			lowerhost = host.toLowerCase ();
		
		logRequest (httpRequest);
		
		//stats
			//hits today
				if (!utils.sameDay (now, worldOutlineStats.whenLastHit)) { //day rollover
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
			console.log ("loadConfig: config == " + utils.jsonStringify (storedConfig)); //xxx
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
				console.log ("buildDomainsTable: domains == " + utils.jsonStringify (domains));
				
				console.log ("\n" + myProductName + " v" + myVersion + " running on port " + appConfig.port + ".\n");
				http.createServer (handleRequest).listen (appConfig.port);
				
				setInterval (everyMinute, 60000); 
				});
			});
		});
	}
startup ();
