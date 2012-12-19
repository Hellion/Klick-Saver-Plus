// ==UserScript==
// @name           Klick-saver Plus
// @version        1.79
// @namespace      http://kobe.cool.ne.jp/yehman/
// @homepage       http://www.frogorbits.com/kol/
// @copyright      © 2010 Nathan Sharfi, Shawn Yeh, and Nick England
// @license        GPL; http://www.gnu.org/copyleft/gpl.html
// @author         Shawn Yeh (http://kobe.cool.ne.jp/yehman/)
// @author         Nick England
// @contributor    CDMoyer
// @contributor    adiabatic (http://www.frogorbits.com/)
// @contributor    Hellion
// @contributor    MutantPickles
// @include        *kingdomofloathing.com/main_c.html
// @include        *kingdomofloathing.com/main.html
// @include        *kingdomofloathing.com/game.php
// @include        *kingdomofloathing.com/fight.php*
// @include        *kingdomofloathing.com/charpane.php
// @include        *kingdomofloathing.com/adventure.php*
// @include        *kingdomofloathing.com/choice.php
// @include        *kingdomofloathing.com/ocean.php
// @include        *kingdomofloathing.com/account.php
// @exclude        forums*kingdomofloathing.com*
// @include        http://127.0.0.1:*
// @description    Adds buttons to your charpane which let you select Auto(W)eapon, (I)tem, (S)kill, (M)acro, (A)dventure, (O)lfact, and/or (Q)uit on. Hover your mouse over each button to see what it does when clicked or double-clicked.
// ==/UserScript==


const COUNTER = 1;  		//-1: off  0: start on zero  1: start on one
const OFF = 0;
const ATTACK = 1;
const USE_ITEM = 2;
const USE_SKILL = 3;
const USE_MACRO = 4;
const GO_ALWAYS = 1;
const GO_CONDITIONAL = 3;
const AUTO_USE_LIMIT = 26;	//the default round at which autoUse will be temporarily disabled
const SAFETY_NUMBER = 1.8;	//This is extra safety factor which is used with monster damage
const STOP_LIST = "pail of pretentious paint, "+
			"pretentious paintbrush, "+
			"pretentious palette, "+
			"box of birthday candles, "+
			"eldritch butterknife, "+
			"dodecagram, "+
			"S.O.C.K., "+
			"mosquito larva, "+
			"ruby W, "+
			"sonar-in-a-biscuit, "+
			"baseball, "+
			"enchanted bean";

var turnsplayed = 0;

// The event manager will unload all registered event on page unload, including itself.
// Note only by using addEventListener(target,...) will the event be registered, and not
// target.addEventListener(...), as the prototype function was not replaced.
var registeredEventListeners = new Array();
addEventListener(window, 'unload', unregisterEventListeners, false);

//SGM_log("doc.loc.path="+document.location.pathname);

function SGM_log(message) {
	return;
	GM_log(message);
}

switch(document.location.pathname) {
//first screen post-login (?): initialize.
  case "/main_c.html":
  case "/game.php":
  case "/main.html":
	GM_setValue("autoUse", 0);				// 0: off  1: weapon  2: item  3: skill  4: macro
	GM_setValue("repeatAdv", 0);			// 0: off  1: normal  3: stop on specific item drops
	GM_setValue("fightTurns", COUNTER);
	GM_setValue("stopAdvAt", 0);			// stop adventuring when our turncount reaches this number.
	GM_setValue("adventuresLeft", 0);
	GM_setValue("storedSkill", 'none');
//	GM_setValue("MP",0);
//	GM_setValue("HP",0);
//	GM_setValue("MaxHP",0);
//	GM_setValue("MaxMP",0);
	grabMPHP();
	GM_setValue("skillCost",1);
	GM_setValue("cancelAtEnd",0);			// flag for use by buttons that attack or use item until end of combat.
	GM_setValue("autoHeal",0);				// 0: off(white)  1: on(green)  2: half(dark green)  4-5: warn(red)
	GM_setValue("MonsterDamage",0);			// Smallest Monster damage received from this fight
	GM_setValue("aborted",false);			// combat macro aborted, manual intervention necessary
	GM_setValue("alreadyMacroed",false);	// auto-used a macro once this combat already
	GM_setValue("hideme",false);			// minimize memory leakage with a choice to hide buttons when you're not gonna use 'em.
	
	if (!GM_getValue("turnLimit")) GM_setValue("turnLimit", AUTO_USE_LIMIT);
	if (!GM_getValue("finisher")) GM_setValue("finisher", 0);
	break;

  case "/charpane.php":
	SGM_log("processing charpane");
	drawButtons();
//	grabMPHP();
	if (GM_getValue("repeatAdv") != OFF) {
		var fightpaneDoc = top.document.getElementsByName('mainpane')[0].contentDocument.getElementsByTagName("body")[0];
		if (fightpaneDoc.innerHTML.indexOf("WINWINWIN") != -1) {
			var testturnsplayed = parseInt(GM_getValue("turnsplayed"),10);
			var fightturn = parseInt(GM_getValue("fightcompleteturn"),10);
			if ((fightturn+1) < testturnsplayed)  {
				SGM_log("fightwas = "+fightturn+"; turnsplayed="+testturnsplayed+"; Autoadventuring from charpane.");
				doAutoAdv(2);			
			}
			else SGM_log("fightwas = "+fightturn+"; turnsplayed="+testturnsplayed+".  fightturn>=turnsplayed-1; leaving things alone.");
		}
		else SGM_log("not a fight, so not checking from charpane");
	}
	else SGM_log("repeatAdv is Off, not checking for advanture-again from charpane");
	//SGM_log("mainpane="+fightpaneDoc.innerHTML);
	break;

  case "/fight.php":
		doMainFight();
	break;
  case "/trickortreat.php":
		doHalloween();
	break;

  case "/adventure.php":
  case "/choice.php":
  case "/ocean.php":
		GM_setValue("fightcompleteturn",GM_getValue("turnsplayed"));	// record this round as completed.
		SGM_log("setting fightcompleteturn to "+GM_getValue("turnsplayed")+" from choice/adv/ocean");
		if(GM_getValue("repeatAdv"))
			doAutoAdv(0);
	break;

  case "/account.php":
		buildPrefs(); // setPrefs();
	break;
}

function doMainFight() {
	SGM_log("fight!");
	var FightHeader = document.getElementsByTagName("b"); 
	if (!FightHeader) {
		SGM_log("no fight header found, aborting combat action.");
		return; 
	}
	FightHeader = FightHeader[0];
	var body = document.getElementsByTagName("body")[0].innerHTML;
//----------------------
// Notes to the maintainer:
// the GM value "olfact" is a flag to indicate whether the olfaction button is set to active or not.
// It gets set (or cleared) only in the button-click processing section.
// 
// "olfactGo", on the other hand, is a flag to indicate whether or not we are interested in olfacting something RIGHT NOW.
// It is set whenever we load the sidepane and "On the Trail" is not found.
// It is cleared whenever we actually olfact something.

// first, a check to see if we had to save the old selected skill in order to olfact something last round.
	if (GM_getValue("oldskill")) {	// if yes, then we have to switch back to the old skill now.	
		var oldskill = GM_getValue("oldskill");
		var sel = document.getElementsByName("whichskill");	// if combat ends in round 0 due to autoattack or familiar action after autoattack,
															// there is no select box.  Detect this condition.
		if (sel.length) {
			sel = sel[0];
			var opts = sel.childNodes; var len = opts.length;
			for(var i=0; i<len; i++) {
				if(opts[i].value == oldskill) {
					sel.selectedIndex = i;
					break;
				}
			}
			GM_setValue("oldskill",false);					// only un-set the old skill if we managed to reset the skillbox successfully.
		}
		GM_setValue("olfactGo", false);	// safety setting:  If we're putting back the old skill, disable olfaction manually for this round just in case the sidepane hasn't been updated yet.
	}

//	SGM_log("olfact="+GM_getValue("olfact"));
//	SGM_log("olfactGo="+GM_getValue("olfactGo"));
	if(GM_getValue("olfact") && GM_getValue("olfactGo")) {	// If the Olfaction button is on, and "On the trail" is not a current effect:
		var monname = document.getElementById("monname");
//		SGM_log("monname="+monname.innerHTML);
		if(monname && monname.innerHTML.toLowerCase().indexOf(GM_getValue("olfactString").toLowerCase()) != -1) {  // this is what we're after?
			GM_setValue("olfactGo", false);
			addEventListener(window, 'load', function() {
				var sel = document.getElementsByName("whichskill");
				if (!sel.length) {
					SGM_log("no skill input box found; aborting combat action.");
					return; // no skill element found on page; abort.
				}
				sel = sel[0];
				var opts = sel.childNodes; var len = opts.length; var found = false;
				for(var i=0; i<len; i++) {
					if(opts[i].value == 19) {
						found = true;
						SGM_log("oldskill="+opts[sel.selectedIndex].value);
						GM_setValue("oldskill", opts[sel.selectedIndex].value);
						sel.selectedIndex = i;
						document.forms.namedItem("skill").submit();
						break;
					}
				}
				if(!found) {
					SGM_log("can't olfact, skill not found.");
					var mydiv = document.createElement('div');
					mydiv.innerHTML = '<center><font color="red">Unable to Olfact: skill not found. (Insufficient MP?)</font></center>';
					document.body.appendChild(mydiv);
					return;	// return without submitting anything, so the script halts.
				}
			}, true);
			return false;
		}
	}
	
// "Quit adventuring when you hit this string" processing.
	if(GM_getValue("stopGo")) {	
//		SGM_log("checking for stopGo");
		if (document.body.innerHTML.indexOf(GM_getValue("stopString")) != -1) 
		{	stopAdventuring("hit Quit-On text.");
			//GM_setValue("stopGo", false);				// uncomment this to force re-clicking in order to re-halt.
			return false;
		}	
	}
//-----------------------
	if(GM_getValue("fightTurns") == COUNTER)	// Grab your HP and MP from the charpane during the first round of combat.
		grabMPHP();

	if (!body.match(/WINWINW|Adventure Again |Go back to /g)){		// still in combat? (no win marker/ no adventure again/ no go back?)
//		SGM_log("still fighting")
		var turns = GM_getValue("fightTurns");
		
		if (body.match(/Macro Aborted|You twiddle your thumbs|Invalid macro command/)) {
			GM_setValue("aborted",true);
		}

		//Adds Round Counter to page, set COUNTER to -1 to turn counter off
		if (COUNTER >= 0){
			strTurns = " - " + (turns >= AUTO_USE_LIMIT ? "<span style=\"color:red;\">" + "Round " + turns + "</span>" : "Round " + turns);
			FightHeader.innerHTML += strTurns;
		}
		
		addInputButtons();

		grabCombatInfo();

		doCombat(turns);
	}
	//if we get here, it must be the end of a combat
	else {
		var foo = GM_getValue("turnsplayed");
		SGM_log("foo="+foo);
		GM_setValue("fightcompleteturn",foo);	// mark fight as complete.
		SGM_log("fight completed, fightturn set to "+foo);
		if (body.match(/You slink away, dejected and defeated./)) {	// occurs both on beaten-up and on >30 rounds.  yay.
			stopAdventuring("looks like you lost the fight, bucko.");
		}
		GM_setValue("aborted",false);			// just in case we managed to twiddle our thumbs outside of a macro.
		GM_setValue("alreadyMacroed",false);	// done trying to hit the macro button.
		doAutoAdv(0);					// respects the flag we set in stopAdventuring(), so we're fine with always calling it.
	}
}

function drawButtons() {

	var adventuresLeft = 0;
	var insertAt;

	turnsplayed = unsafeWindow.turnsplayed;
	SGM_log("uW.tp="+unsafeWindow.turnsplayed);
	GM_setValue("turnsplayed", turnsplayed);
	//render the button layout
	// the variable needtoolfact is a flag to indicate whether or not "On the Trail" is a currently active effect
	// (i.e. are we already olfacting something).  If True, then we need to olfact ASAP.
	var needtoolfact = false;
	var fullTest = document.getElementsByTagName("a")[0]; 
	if (!fullTest) {
		SGM_log("Unable to determine if we're in full or compact mode.  Exiting.");
		return;
	}
//	first link in the charpane in Full Mode is your avatar icon, which comes from the /otherimages/ directory.
	if (fullTest.innerHTML.indexOf("/otherimages/") == -1){		// lacking a graphic from the /otherimages/ directory, we assume that we are in Compact Mode.
		insertAt = document.getElementsByTagName("hr")[0];
		if (insertAt == null) {
			GM_log("unable to locate insertion point for button bar.  Exiting.");
			return;
		}
		var newHr = document.createElement('hr');
		newHr.setAttribute('width','50%');
		insertAt.parentNode.insertBefore(newHr, insertAt.nextSibling);
		var test = document.getElementsByTagName("body")[0].innerHTML.substr(document.getElementsByTagName("body")[0].innerHTML.indexOf("Adv</a>:") + 33, 4);
		adventuresLeft = parseInt(test);
//		SGM_log("test="+test+", advLeft (compact)="+adventuresLeft);		
		if(GM_getValue("olfact")) {
			needtoolfact = true;
// find "On the Trail" in compact mode by using the Alt tags on images.
			var imgs = document.getElementsByTagName('img'); var len = imgs.length;
			for(var i=0; i<len; i++) {
				if (imgs[i].alt.indexOf("On the Trail") != -1) {
					needtoolfact = false; i=len; break; 
				}
			}
			if(needtoolfact) GM_setValue("olfactGo", true);
			else GM_setValue("olfactGo", false);
		}
	} else {		// otherwise, we are in Full Mode.
		insertAt = document.getElementsByTagName("table")[0];
		adventuresLeft = document.getElementsByTagName("img")[4].nextSibling.nextSibling.innerHTML;
		SGM_log("advLeft (full)="+adventuresLeft);		
		if(GM_getValue("olfact")) {
			needtoolfact = true;
// find "On the Trail" in full mode by using the description text in the font tags.
			var effs = document.getElementsByTagName('font'); len = effs.length;
			for (i=0;i<len;i++) { 
				if (effs[i].innerHTML.indexOf("On the Trail") != -1) { 
					needtoolfact = false; i=len; break;
				} 
			}
			if (needtoolfact) GM_setValue("olfactGo",true);
			else GM_setValue("olfactGo", false);
		}
	}
	if (!isNaN(adventuresLeft)) GM_setValue("adventuresLeft", adventuresLeft);
	else SGM_log("unable to read adventuresLeft in full-mode charpane!");
	
	var oMon = GM_getValue("olfactString","");
	var oString = "click to automatically olfact a monster";
	if (oMon != "") oString = "currently olfacting: "+oMon;
	var newTable = document.createElement('table');
	var buffer = "<tr><td title='click to autoattack'>W</td>" +
				 "<td title='click to auto-use your last-used item'>I</td>" +
				 "<td title='click to automatically use your last-used skill'>S</td>" +
				 "<td title='click to automatically use your last-used combat macro'>M</td>" +
				 "<td title='click to automatically adventure again; double-click to auto-adventure for a set number of rounds'>A</td>" +
				 "<td id='olabel' title='"+oString+"'>O</td>" +
				 "<td title='click to quit on seeing some text'>Q</td></tr>" ;
	addGlobalStyle("table[id='buttonbox'] { table-layout: auto }"
			+ "table[id='buttonbox'] { border-spacing: 1px }"
			+ "table[id='buttonbox'] td { width: 11px }"
			+ "table[id='buttonbox'] td { font-size: .6em }"
			+ "table[id='buttonbox'] td { border: 2px solid black }"
			+ "table[id='buttonbox'] td { text-align: center }"
			+ "table[id='buttonbox'] td { cursor: default }"
			+ "table[id='buttonbox'] td.off { background-color: white }"
			+ "table[id='buttonbox'] td.on { background-color: lime }"
			+ "table[id='buttonbox'] td.warn { background-color: red }"
			+ "table[id='buttonbox'] td.half { background-color: #32CD32 }"
				);
//	var A_only_buffer = "<td title='click to automatically adventure again; double-click to auto-adventure for a set number of rounds'>A</td>";

	newTable.setAttribute('id','buttonbox');
	newTable.innerHTML = buffer;
	var tdArray = newTable.getElementsByTagName("td");
	if ((GM_getValue("autoUse") % 5) != OFF)
		tdArray[(GM_getValue("autoUse") % 5) - 1].setAttribute('class',(GM_getValue("autoUse") < 5)?'on':'warn');
	if (GM_getValue("repeatAdv"))
		tdArray[4].setAttribute('class',(GM_getValue("repeatAdv") < 2)?'on':'half');
	if (GM_getValue("stopAdvAt") > turnsplayed && GM_getValue("stopAdvAt") > 0)
		tdArray[4].innerHTML = GM_getValue("stopAdvAt") - turnsplayed;
	if (GM_getValue("olfact"))
		tdArray[5].setAttribute('class','on');
	if (GM_getValue("stopGo"))
		tdArray[6].setAttribute('class','on');

//	if (GM_getValue("hideme") == true) {
//		var hidebuffer = "<tr><td title='click to re-enable button bar'>B</td>";
//		newTable.innerHTML = hidebuffer;
//		tdArray = newTable.getElementsByTagName("td");
//		addEventListener(tdArray[0], 'click', function(event) {
//			var hidden = GM_getValue("hideme");
//			hidden = !hidden;
//			GM_setValue("hideme",hidden);
//		}, true);
//		insertAt.parentNode.insertBefore(newTable, insertAt.nextSibling);
//		return;
//	}
	
	//  If currently auto-adventuring, show only A button.
//	if (GM_getValue("repeatAdv") != OFF) {
//		var A_only_buffer = "<td title='click to automatically adventure again; double-click to auto-adventure for a set number of rounds'>A</td>";
//		newTable.innerHTML = A_only_buffer;
//		tdArray = newTable.getElementsByTagName("td");
//		if (GM_getValue("repeatAdv"))
//			tdArray[0].setAttribute('class',(GM_getValue("repeatAdv") < 2)?'on':'half');
//		if (GM_getValue("stopAdvAt") > turnsplayed && GM_getValue("stopAdvAt") > 0)
//			tdArray[0].innerHTML = GM_getValue("stopAdvAt") - turnsplayed;
//		activate_A_button(tdArray[0],adventuresLeft, turnsplayed);
//		insertAt.parentNode.insertBefore(newTable, insertAt.nextSibling);
//		return;
//	}
	
	//add button functions
	for (var i=0; i<tdArray.length; i++){
		switch (i) {
		   case 0:	// W
			addEventListener(tdArray[i], 'click', function(event) {
				if (GM_getValue("autoUse") % 5 == ATTACK){
				  GM_setValue("autoUse", OFF);
				  this.setAttribute('class','off');
				}else{
				  GM_setValue("autoUse", ATTACK);
				  this.setAttribute('class','on');
				  this.nextSibling.setAttribute('class','off');	// I off
				  this.nextSibling.nextSibling.setAttribute('class','off');	// S off
				  this.nextSibling.nextSibling.nextSibling.setAttribute('class','off'); // M off
				}
			}, true);
			addEventListener(tdArray[i], 'dblclick', function(event) {
				var turnLimit = parseInt(prompt('Stop Auto-Doing Stuff after XX Rounds... (1-29)'));
				if (turnLimit > 1 && turnLimit < 30 )
					GM_setValue("turnLimit", turnLimit);
				else
					GM_setValue("turnLimit", AUTO_USE_LIMIT);
			}, true);
//			addEventListener(tdArray[i], 'contextmenu', function(event) {
//				var hidden = GM_getValue("hideme");
//				hidden = !hidden;
//				GM_setValue("hideme",hidden);
//			}, true);
			
		      break;
		   case 1:	// I
			addEventListener(tdArray[i], 'click', function(event) {
				if (GM_getValue("autoUse") % 5 == USE_ITEM){
				  GM_setValue("autoUse", OFF);
				  this.setAttribute('class','off');
				}else{
				  GM_setValue("autoUse", USE_ITEM);
				  this.setAttribute('class','on');
				  this.nextSibling.setAttribute('class','off');	// S off
				  this.nextSibling.nextSibling.setAttribute('class','off'); // M off
				  this.previousSibling.setAttribute('class','off'); // A off
				}
			}, true);
		      break;
		   case 2:	// S
			addEventListener(tdArray[i], 'click', function(event) {
				if (GM_getValue("autoUse") % 5 == USE_SKILL){
				  GM_setValue("autoUse", OFF);
				  this.setAttribute('class','off');
				}else{
				  GM_setValue("autoUse", USE_SKILL);
				  this.setAttribute('class','on');
				  this.previousSibling.setAttribute('class','off'); // I off
				  this.previousSibling.previousSibling.setAttribute('class','off'); // A off
				  this.nextSibling.setAttribute('class','off'); // M off
				}
			}, true);
		      break;
		   case 3:	// M
		   	addEventListener(tdArray[i], 'click', function(event) {
				if (GM_getValue("autoUse") % 5 == USE_MACRO){
				  GM_setValue("autoUse", OFF);
				  this.setAttribute('class','off');
				}else{
				  GM_setValue("autoUse", USE_MACRO);
				  this.setAttribute('class','on');
				  this.previousSibling.setAttribute('class','off');	// S off
				  this.previousSibling.previousSibling.setAttribute('class','off'); // I off
				  this.previousSibling.previousSibling.previousSibling.setAttribute('class','off'); // A off
				}
			}, true);
		    break;
			case 4:	// A
			addEventListener(tdArray[i], 'contextmenu', function(event) {
				if (event.button == 2){
					event.stopPropagation();
					event.preventDefault();
				}
			}, false);
			addEventListener(tdArray[i], 'mousedown', function(event) {
				if (event.button == 2 && GM_getValue("repeatAdv") != GO_CONDITIONAL){
				  GM_setValue("repeatAdv", GO_CONDITIONAL);
				  this.setAttribute('class','half');
				}else if (event.button == 0 && GM_getValue("repeatAdv") != GO_ALWAYS){
				  GM_setValue("repeatAdv", GO_ALWAYS);
				  this.setAttribute('class','on');
				}else{
				  GM_setValue("repeatAdv", OFF);
//				  SGM_log("ungreening A due to button-click");
				  this.setAttribute('class','off');
				}
			}, true);
			addEventListener(tdArray[i], 'dblclick', function(event) {
				var adventureLimit = parseInt(prompt('Auto-adventure for how many turns?'));
				if (adventureLimit > adventuresLeft) adventureLimit = adventuresLeft;
				else if (adventureLimit < 0 || !adventureLimit) adventureLimit = 0;
				if (adventureLimit > 0) {
					GM_setValue("stopAdvAt", turnsplayed + adventureLimit);
					GM_setValue("repeatAdv", GO_ALWAYS);
					this.innerHTML = adventureLimit;
					this.setAttribute('class','on');
				}else if (adventureLimit == 0){
					GM_setValue("stopAdvAt", turnsplayed);
					GM_setValue("repeatAdv", OFF);
//					SGM_log("ungreening A due to 0 turns entered");
					this.innerHTML = 'A';
					this.setAttribute('class','off');
				}
			}, true);
		      break;
		   case 5:	// O
			addEventListener(tdArray[i], 'mouseup', function(event) {
				if (GM_getValue("olfact")){
				  GM_setValue("olfact", false);
				  this.setAttribute('class','off');
				}else{
				  GM_setValue("olfact", true);
				  this.setAttribute('class','on');
				}
			}, true);
			addEventListener(tdArray[i], 'dblclick', function(event) {
				var monster = GM_getValue("olfactString", monster);
				var mylabel = document.getElementById('olabel');
				if(monster == undefined) monster = '';
				monster = prompt('Transcendently Olfact which monster?', monster);
				if (monster && monster != '') {
					GM_setValue("olfactString", monster);
					GM_setValue("olfact", true);
					this.setAttribute('class','on');
					mylabel.title = 'currently olfacting: '+monster;
					
				} else {
					GM_setValue("olfactString", '');
					GM_setValue("olfact", false);
					this.setAttribute('class','off');
					mylabel.title = 'click to automatically olfact a monster';
				}
				event.stopPropagation();
				event.preventDefault();
			}, true);
		    break;
		   case 6:	// Q
			addEventListener(tdArray[i], 'mouseup', function(event) {
				if (GM_getValue("stopGo")){
				  GM_setValue("stopGo", false);
				  this.setAttribute('class','off');
				}else{
				  GM_setValue("stopGo", true);
				  this.setAttribute('class','on');
				}
			}, true);
			addEventListener(tdArray[i], 'dblclick', function(event) {
				var stopstr = GM_getValue("stopString");
				if(stopstr == undefined) stopstr = '';
				stopstr = prompt('Stop adventuring when seeing this (case-sensitive) string:', stopstr);
				if (stopstr && stopstr != '') {
					GM_setValue("stopString", stopstr);
					GM_setValue("stopGo", true);
					this.setAttribute('class','on');
				} else {
					GM_setValue("stopString", '');
					GM_setValue("stopGo", false);
					this.setAttribute('class','off');
				}
				event.stopPropagation();
				event.preventDefault();
			}, true);
		   break;

		}
	}

	insertAt.parentNode.insertBefore(newTable, insertAt.nextSibling);
}

//function activate_A_button(tdItem, adventuresLeft, turns_played) {
//
//	addEventListener(tdItem, 'contextmenu', function(event) {
//		if (event.button == 2){
//			event.stopPropagation();
//			event.preventDefault();
//		}
//	}, false);
//	addEventListener(tdItem, 'mousedown', function(event) {
//		if (event.button == 2 && GM_getValue("repeatAdv") != GO_CONDITIONAL){
//		  GM_setValue("repeatAdv", GO_CONDITIONAL);
//		  this.setAttribute('class','half');
//		}else if (event.button == 0 && GM_getValue("repeatAdv") != GO_ALWAYS){
//		  GM_setValue("repeatAdv", GO_ALWAYS);
//		  this.setAttribute('class','on');
//		}else{
//		  GM_setValue("repeatAdv", OFF);
////				  SGM_log("ungreening A due to button-click");
//		  this.setAttribute('class','off');
//		}
//	}, true);
//	addEventListener(tdItem, 'dblclick', function(event) {
//		var adventureLimit = parseInt(prompt('Auto-adventure for how many turns?'));
//		if (adventureLimit > adventuresLeft) adventureLimit = adventuresLeft;
//		else if (adventureLimit < 0 || !adventureLimit) adventureLimit = 0;
//		if (adventureLimit > 0) {
//			GM_setValue("stopAdvAt", turns_played + adventureLimit);
//			GM_setValue("repeatAdv", GO_ALWAYS);
//			this.innerHTML = adventureLimit;
//			this.setAttribute('class','on');
//		}else if (adventureLimit == 0){
//			GM_setValue("stopAdvAt", turns_played);
//			GM_setValue("repeatAdv", OFF);
////					SGM_log("ungreening A due to 0 turns entered");
//			this.innerHTML = 'A';
//			this.setAttribute('class','off');
//		}
//	}, true);
//}


// Try to read in MP and HP values from the charpane
//
function grabMPHP() {
	GM_get("/api.php?what=status&for=KlickSaverPlus",function(response) {
		readMPHP(response);
	});
}

function readMPHP(response) {
	var CPInfo = JSON.parse(response);
	var hp = CPInfo["hp"];
	var maxhp = CPInfo["maxhp"];	
	var mp = CPInfo["mp"];
	var maxmp = CPInfo["maxmp"];
	GM_setValue("HP",hp);
	GM_setValue("MaxHP",maxhp);
	GM_setValue("MP",mp);
	GM_setValue("MaxMP",maxmp);
}

//function grabmpHP() {
//	var charpaneDoc = top.document.getElementsByName('charpane')[0].contentDocument.getElementsByTagName("body")[0];
//	if (!charpaneDoc) { 
//		SGM_log("no content available to process in grabMPHP(); continuing without extra info.");
//		return;
//	}
//	var pageBodyText = charpaneDoc.innerHTML;
//// full mode:
//	var foo = document.querySelector("img[alt='Hit Points']");
//	var foohp;
//	if (foo) foohp = parseInt(foo.nextSibling.nextSibling.innerHTML);
//	GM_log("hp = " + foohp);
//	var HP = pageBodyText.match(/onclick='doc\("hp"\);'[^>]*>(?:<[^<]+>)*(\d+)(?:<[^<]+>)*(?:\&nbsp;)?\/(?:\&nbsp;)?(\d+)<\/span>/);
//	var MP = pageBodyText.match(/onclick='doc\("mp"\);'[^>]*>(?:<[^<]+>)*(\d+)(?:<[^<]+>)*(?:\&nbsp;)?\/(?:\&nbsp;)?(\d+)<\/span>/);
//	if (!HP) HP = pageBodyText.match(/onclick="doc\(&quot;hp&quot;\);"[^>]*>(?:<[^<]+>)*(\d+)(?:<[^<]+>)*(?:\&nbsp;)?\/(?:\&nbsp;)?(\d+)<\/span>/);
//	if (!MP) MP = pageBodyText.match(/onclick='doc\(&quot;mp&quot;\);'[^>]*>(?:<[^<]+>)*(\d+)(?:<[^<]+>)*(?:\&nbsp;)?\/(?:\&nbsp;)?(\d+)<\/span>/);
//// compact mode: 
//	if (!HP) HP = pageBodyText.match(/HP:(?:<[^<]+>)*(\d+)(?:<[^<]+>)*(?:\&nbsp;)?\/(?:\&nbsp;)?(\d+)/);
//	if (!MP) MP = pageBodyText.match(/MP:(?:<[^<]+>)*(\d+)(?:<[^<]+>)*(?:\&nbsp;)?\/(?:\&nbsp;)?(\d+)/);
//	
//	if (HP) {
//		GM_setValue("HP", Number(HP[1]));
//		GM_setValue("MaxHP", Number(HP[2]));
//	} else {
//		SGM_log("grabMPHP(): Error - Regex used to extract HP/MaxHP failed to match anything.");
//	}
//	
//	if (MP) {
//		GM_setValue("MP", Number(MP[1]));
//		GM_setValue("MaxMP", Number(MP[2]));
//	} else {
//		SGM_log("grabMPHP(): Error - Regex used to extract MP/MaxMP failed to match anything.");
//	}
//}

function addInputButtons() {
//	SGM_log("Creating fight-page buttons");
	// for attacking until the end of the round
    var NewAttack = document.createElement('input');
	NewAttack.setAttribute('class','button');
	NewAttack.setAttribute('value','Attack!');
	NewAttack.setAttribute('type','button');
	NewAttack.setAttribute('style','margin-left:1em;display:inline;');
	NewAttack.setAttribute("id","NewAttack");
	addEventListener(NewAttack, 'click', AttackScript, true);
	document.getElementById('tack').parentNode.appendChild(NewAttack);

    // for using the current item until the end of the round
	var NewItem = document.createElement('input');
	NewItem.setAttribute('class','button');
	NewItem.setAttribute('value','Item!');
	NewItem.setAttribute('type','button');
	NewItem.setAttribute('style','margin-left:1em;display:inline;');
	addEventListener(NewItem, 'click', ItemScript, true);
	document.getElementById("NewAttack").parentNode.appendChild(NewItem);
}


// Grab combat information like MP, HP, monster damage, and fumble damage
//
function grabCombatInfo(){
	var pageBodyText = document.getElementsByTagName("body")[0].innerHTML;
	
	//This section grabs MP healing
	var MPGainText = pageBodyText.match(/You gain \d+ (?=Muscularity|Mana|Mojo)/g);
	if(MPGainText){
		for(var i=0;i<MPGainText.length;i++){
			var curGain = Number(MPGainText[i].slice(8,-1));
			GM_setValue("MP", GM_getValue("MP") + curGain);
			//SGM_log("Gained "+curGain+" MP, current MP: "+GM_getValue("MP"));
			if(GM_getValue("MP") > GM_getValue("MaxMP"))
				GM_setValue("MP",GM_getValue("MaxMP"));
		}
	}

	//This section grabs player healing
	var HealText = pageBodyText.match(/You gain \d+ (?=hit point)/g);
	if(HealText){
		for(var i=0;i<HealText.length;i++){
			var curHeal = Number(HealText[i].slice(8,-1));
			GM_setValue("HP",GM_getValue("HP") + curHeal);
			//SGM_log("Healed " +curHeal+ " HP, current HP: "+GM_getValue("HP"));
			if(GM_getValue("HP") > GM_getValue("MaxHP") && !(i == HealText.length -1 && pageBodyText.indexOf("Your Jalape") != -1))
				GM_setValue("HP",GM_getValue("MaxHP"));
		}
	}
		
	//This section grabs MP loss
	var MPLossText = pageBodyText.match(/You lose \d+ (?=Muscularity|Mana|Mojo)/g);
	if(MPLossText){
		var curLoss = Number(MPLossText[0].slice(8,-1));
		GM_setValue("MP", GM_getValue("MP") - curLoss);
		//SGM_log("Loss MP: "+curLoss);
		if(GM_getValue("MP") < 0)
			GM_setValue("MP", 0);
	}
	
	//This section tries to grab monster damage
	var DamageText = pageBodyText.match(/You lose \d+ (?=hit point)/g);
	if(DamageText){
		var curDamage = Number(DamageText[0].slice(8,-1));
		GM_setValue("HP",GM_getValue("HP") - curDamage);
		if (curDamage < GM_getValue("MonsterDamage") || GM_getValue("MonsterDamage")==0){
			GM_setValue("MonsterDamage",curDamage);
			//SGM_log("MDam: "+GM_getValue("MonsterDamage") +", current HP: "+GM_getValue("HP"));
		}
	}
}

function doCombat(turns) {
	if (GM_getValue("MonsterDamage") * 1.1 > GM_getValue("HP")) {
		setToRed();
		stopAdventuring("too dangerous to continue!"+GM_getValue("MonsterDamage")+" vs "+GM_getValue("HP"));
		return;
	}
	if (GM_getValue("fightTurns") < GM_getValue("turnLimit")) {
		var useThis = GM_getValue("autoUse") % 5;
		GM_setValue("autoUse",useThis);

// 		pickpocket / pickpocket again
		if (GM_getValue("alwayspick") == 1) {
			if (document.forms.namedItem("steal")) document.forms.namedItem("steal").submit();
		}
//		SGM_log("useThis="+useThis);
		switch(useThis) {
			case ATTACK:
				SGM_log("Attacking");
				addEventListener(window, 'load', function() { 
					AttackScript(false); 
				}, true);
			 break;
			case USE_ITEM:
				SGM_log("Using Item");
				addEventListener(window, 'load', function() {
					ItemScript(false);
				}, true);
			break;
			case USE_SKILL:
				SGM_log("Using Skill");
				addEventListener(window, 'load', function() { 
					SkillScript(false); return;
				}, true);
			break;
			case USE_MACRO:
				SGM_log("Using Macro");
				addEventListener(window, 'load', function() {
//					SGM_log("load event fired.");
					if (GM_getValue("alreadyMacroed")) {
						SGM_log("already macroed once this combat, not gunna do it again.  No way, no how, nosirree.");
						return;
					}
					var whichMacroRef = getSelectByName("whichmacro"); 
					if (!whichMacroRef) {
						SGM_log("no macro found, abort");
						return;
					}
					var macroChosen = whichMacroRef.selectedIndex;
					if (macroChosen == 0) {
						SGM_log("no macro selected, abort");
						setToRed();
						return;
					}
					if (GM_getValue("aborted")) {
						SGM_log("ABORTED flag set, aborting.");
						setToRed();
						GM_setValue("aborted",false);
						return;
					}
					GM_setValue("alreadyMacroed",true);
					SGM_log("submitting macro");
					document.forms.namedItem("macro").submit();
				}, true);
			break;
			default:
				SGM_log("no fight action selected");
			// 	no automatic combat action selected.
			break;
		}
	}	else if (GM_getValue("finisher") != 0){
		  addEventListener(window, 'load', function() { 
			if (GM_getValue("finisher") == 1){
				document.forms.namedItem("attack").submit();
				return;
			}
			var whichSkillRef = document.getElementsByName("whichskill")[0];
			
			if (!whichSkillRef) return;
			
			for(var i = 0; i < whichSkillRef.length; i++)
				if(whichSkillRef.options[i].value == GM_getValue("finisher"))
					whichSkillRef.selectedIndex = i;
			if (whichSkillRef.selectedIndex == 0){
				setToRed();
				return;
			}
			var costText = whichSkillRef.options[whichSkillRef.selectedIndex].text.match(/\d+/g);
			if (costText) {
//				GM_log("costtext0="+costText[0]);
				GM_setValue("MP", GM_getValue("MP") - costText[0]);
			}
			document.forms.namedItem("skill").submit();		
		  }, true);
	} else {
		setToRed();
	}
//	GM_log("fightTurns="+turns);
	GM_setValue("fightTurns", ++turns);
}


function stopAdventuring(msg) {
	GM_setValue("repeatAdv",OFF);
	GM_log("stopping: " + msg);
}

// Automatically click the Adventure Again button from the fight screen
// if forceframe <> 0, force the fight to load in frame 2 (mainpane) because this routine
// is being called from a different frame.
function doAutoAdv(forceframe) {
	grabCombatInfo();
	SGM_log("MP: "+GM_getValue("MP")+".  skillCost: "+GM_getValue("skillCost")+".  HP: "+GM_getValue("HP")+".  MonsterDamage: "+GM_getValue("MonsterDamage"));
	SGM_log(" adventuresLeft: "+GM_getValue("adventuresLeft")+" stopAdvAt: "+GM_getValue("stopAdvAt")+" turns played:" +GM_getValue("turnsplayed"));
	
	var stopAdvAt = GM_getValue("stopAdvAt");
	var body = document.getElementsByTagName("body")[0].innerHTML;
	var acquiredStuff = body.match(/item: <b>[^<]+/g);
	if (GM_getValue("repeatAdv") == GO_CONDITIONAL && acquiredStuff){
		for (var i = 0; i < acquiredStuff.length; i++){
			//SGM_log("item" +i+ ": " + acquiredStuff[i].slice(9));
			if (STOP_LIST.indexOf(acquiredStuff[i].slice(9)) >= 0)
				stopAdventuring("found a stop-list item");  //stop-listed item acquired
		}
	}

	if ((GM_getValue("autoUse")%5 == USE_SKILL) && (GM_getValue("MP") < GM_getValue("skillCost"))) stopAdventuring("MP too low for auto-skillcasting.");
	else if (GM_getValue("HP") < 1) stopAdventuring("got beat up!");
	else if (GM_getValue("repeatAdv") == GO_CONDITIONAL && body.match(/You gain (?:a|some) Level/g)) stopAdventuring("Leveled up!");
	else if (GM_getValue("MonsterDamage") * 1.1 >= GM_getValue("HP")) stopAdventuring("too risky to continue; HP vs Damage = "+GM_getValue("HP")+", "+GM_getValue("MonsterDamage"));
	else if ((stopAdvAt > 0) && (stopAdvAt <= GM_getValue("turnsplayed") + 1)) { 
		stopAdventuring("turns complete.");
		GM_setValue("stopAdvAt",0);
	}	
	//Reset some values since combat is over
	GM_setValue("fightTurns", COUNTER);
	GM_setValue("MonsterDamage", 0);
	GM_setValue("autoHeal", GM_getValue("autoHeal") % 3);
	GM_setValue("autoUse", GM_getValue("autoUse") % 5);
	GM_setValue("aborted",false);			// just in case we managed to twiddle our thumbs outside of a macro.
	GM_setValue("alreadyMacroed",false);	// done trying to hit the macro button.
	if(GM_getValue("cancelAtEnd") == 1){
		GM_setValue("autoUse", OFF);
		GM_setValue("cancelAtEnd", OFF);
	}
	SGM_log("end-of-combat resets complete.");
	if (GM_getValue("repeatAdv")) {
		addEventListener(window, 'load', function() {
			var anchors = document.getElementsByTagName("a");
			for (var i = 0; i < anchors.length; i++) {
				if (((anchors[i].getAttribute('href')) && (anchors[i].getAttribute("href").indexOf("adventure.php") != -1)) ||
					((anchors[i].getAttribute('href')) && (anchors[i].getAttribute("href").indexOf("plains.php?action=brushfire") != -1)) ||
					((anchors[i].getAttribute('href')) && (anchors[i].getAttribute("href").indexOf("invasion.php?action") != -1))) {
//					SGM_log("href="+anchors[i].getAttribute('href')+"; using anchor "+i);
					if (forceframe == 2) { 
						SGM_log("adventuring again from doAutoAdv() via charpane");
						parent.frames[2].location = anchors[i];
					} else {
						SGM_log("adventuring again from doAutoAdv()");
						document.location = anchors[i]; // document.links[i];
					}
					break;
				}
			}
		}, false);
	}
//	SGM_log("done doAutoAdv");
}

function buildPrefs()
{
    if (!document.querySelector('#privacy')) return;
    var scriptID = 'KSP';
    var scriptName = 'Klick-Saver Plus';
    if (!document.querySelector('#scripts'))
    {
//		SGM_log("Creating script tag");
        //scripts tab is not built, do it here
        var scripts = document.querySelector('ul').appendChild(document.createElement('li'));
        scripts.id = 'scripts';
        var a = scripts.appendChild(document.createElement('a'));
        a.href = '#';
        var img = a.appendChild(document.createElement('img'));
        img.src = 'http://images.kingdomofloathing.com/itemimages/cmonkey1.gif';
        img.align = 'absmiddle';
        img.border = '0';
        img.style.paddingRight = '10px';
        a.appendChild(document.createTextNode('Scripts'));
        a.addEventListener('click', function (e)
        {
            //make our new tab active when clicked, clear out the #guts div and add our settings to it
            e.stopPropagation();
            document.querySelector('.active').className = '';
            document.querySelector('#scripts').className = 'active';
            document.querySelector('#guts').innerHTML = '<div class="scaffold"></div>';
            document.querySelector('#guts').appendChild(buildSettings());
            //click handler for everything in this section
//            document.querySelector('#' + scriptID).addEventListener('click', changeSettings, false);
			GM_get("/account.php?tab=combat", insertAttack);
        }, false);
    }
    else
    {
//		SGM_log("adding to script tag");
        //script tab already exists
        document.querySelector('#scripts').firstChild.addEventListener('click', function (e)
        {
            //some other script is doing the activation work, just add our settings
            e.stopPropagation();
            document.querySelector('#guts').appendChild(buildSettings());
            //click handler for everything in this section
//           document.querySelector('#' + scriptID).addEventListener('click', changeSettings, false);
			GM_get("/account.php?tab=combat", insertAttack);
        }, false);
    }

	function setPrefs(prefSpan) {
		var newBr = document.createElement('br');
		var newB2 = document.createElement('br');				// probably don't need two of these ... ?
		var finisherButton = document.createElement('input');	// sets the skill to use when turnLimit is reached.
		var pickButton = document.createElement('input');		// always click "PickPocket" immediately if the button is present.

		finisherButton.setAttribute('class','button');
		finisherButton.setAttribute('value',(GM_getValue("finisher") == 0)?'Set Finisher':'Finisher - '+finisherName(GM_getValue("finisher")) );
		finisherButton.setAttribute('type','button');
		finisherButton.setAttribute('style','margin-top:.1em;');
		finisherButton.setAttribute('id','finisherButton');
		addEventListener(finisherButton, 'click', finishClicked, true);
		
		pickButton.setAttribute('class','button');
		pickButton.setAttribute('value',(GM_getValue("alwayspick") == 0?'Always pickpocket: NO':'Always pickpocket: YES'));
		pickButton.setAttribute('type','button');
		pickButton.setAttribute('style','margin-top:.1em');
		pickButton.setAttribute('id','pickButton');
		addEventListener(pickButton, 'click', pickClicked, true);
		
		prefSpan.appendChild(newBr);
		prefSpan.appendChild(finisherButton);
		prefSpan.appendChild(newB2);
		prefSpan.appendChild(pickButton);

		function finishClicked() {		// set finisher to whatever's in the autoattack dropdown.
			var whichAttack = document.getElementsByName("whichattack");
			GM_setValue("finisher", whichAttack[0].value);
			this.value = "Finisher - " + finisherName(GM_getValue("finisher"));
		}
		function pickClicked() {		// toggle always-pickpocket option.
			var pickpocket = GM_getValue("alwayspick",0);
			pickpocket = 1 - parseInt(pickpocket);
			GM_setValue("alwayspick",pickpocket);
			this.value = pickpocket?"Always pickpocket: YES":"Always pickpocket: NO";
		}
		// Grab the skill name from the option list to display in the button text.
		function finisherName(val){
			var whichAttack = document.getElementsByName('whichattack');
			for (var i = 0; i < whichAttack[0].options.length; i++)
				if (whichAttack[0].options[i].value == val)
					var finisherStr = whichAttack[0].options[i].text;
			if (finisherStr){
				if (val == 0) return('disabled');
				else if (val == 1) return('Attack with weapon');
				else return(finisherStr.match(/[^\(]+/g)[0]);
			}
			else return(null);
		}
	}

	function buildSettings()
	{
		//build our settings and return them for appending
		var guts = document.body.appendChild(document.createElement('div'));
		guts.id = scriptID;
		
		var subhead = guts.appendChild(document.createElement('div'));
		subhead.className = 'subhead';
		subhead.textContent = scriptName;
		
		var outerdiv = document.createElement('div');
		outerdiv.setAttribute('id','KSP-Div');
		outerdiv.style["border"] = "1px solid blue";
		outerdiv.style["width"] = "95%";
		
		var bigSpan = document.createElement('span');
		bigSpan.setAttribute('id','scriptpref');
		bigSpan.style["margin"] = "0 auto";
		bigSpan.style["display"] = "table-cell";
		bigSpan.style["overflowX"] = "hidden";
		bigSpan.style["overflowY"] = "auto"; 
		bigSpan.style["textalign"] = "left";
		bigSpan.style["lineHeight"] = "2em";
		bigSpan.style["padding"] = "5px";	
		
		var prefSpan = document.createElement('span');
		setPrefs(prefSpan);
		
		bigSpan.appendChild(prefSpan);
		outerdiv.appendChild(bigSpan);
		
		guts.appendChild(outerdiv);
		
		return guts;
	}

}   


// Memory-Leak-free event handling
//
// Registering event handlers with node.addEventHandler causes memory leaks.
// Adding via this function tracks them all, so they can be removed
// when the page unloads.
function addEventListener(target, event, listener, capture)
{
    registeredEventListeners.push( [target, event, listener, capture] );
    target.addEventListener(event, listener, capture);
}
function unregisterEventListeners(event)
{
    for (var i = 1; i < registeredEventListeners.length; i++) // was 0
    {
        var rel = registeredEventListeners[i];
        rel[0].removeEventListener(rel[1], rel[2], rel[3]);
    }
    window.removeEventListener('unload', unregisterEventListeners, false);
}

// n.b. When called from DoCombat(), these functions are explicitly passed a parameter of "false".
//		When called via clicking on the Combat-screen buttons, they are implicitly passed a parameter of the mouse-click event object.
function AttackScript(setCancel) {
	var macrotext = document.getElementsByName("macrotext");
	if (!macrotext.length) { 
		GM_setValue("autoUse",ATTACK);
		if (setCancel) GM_setValue("cancelAtEnd",1);
		document.forms.namedItem("attack").submit(); 
		return; 
	}
	macrotext[0].value="abort pastround 25;attack;repeat;"
	document.forms.namedItem("macro").submit();
}

function ItemScript(setCancel) {
	var itemSelect = document.getElementsByName("whichitem");
	if (itemSelect[0].selectedIndex == 0) {
//		SGM_log("no item selected; abort.");
		setToRed();
	} else {
		var macrotext = document.getElementsByName("macrotext");
		if (!macrotext.length) {
			GM_setValue("autoUse",USE_ITEM);
			if (setCancel) GM_setValue("cancelAtEnd",1);
			document.forms.namedItem("useitem").submit();
		} else {
			var itemnumber = itemSelect[0].options[itemSelect[0].selectedIndex].value;
			var itemnumber2 = 0;
			var funksling = document.getElementsByName("whichitem2");
			if (funksling.length) {
				itemnumber2 = funksling[0].options[funksling[0].selectedIndex].value;
			}
			if (itemnumber2 == 0) macrotext[0].value = "abort pastround 25;use "+itemnumber + "; repeat;";
			else macrotext[0].value = "abort pastround 25;use "+itemnumber + "," +itemnumber2 + "; repeat;";
			document.forms.namedItem("macro").submit();		
		}
	}
}

function SkillScript(setCancel) {
	var skillList=document.getElementsByName("whichskill");
	if (skillList[0].selectedIndex == 0) {
		SGM_log("No skill selected; abort.");
		setToRed();
	} else {
		var costText = skillList[0].options[skillList[0].selectedIndex].text.match(/\d+/g);	// please never have a skill with a number in its name.
		if (costText){
			GM_log("cost="+Number(costText[0]));
			GM_setValue("skillCost", Number(costText[0]));
			GM_setValue("MP", GM_getValue("MP") - costText[0]);	// this will be inaccurate if we macro it, but hopefully that won't matter
																// because we'll get correct values when the macro finishes.
		}
		var macrotext = document.getElementsByName("macrotext");
		if (!macrotext.length) {
//			GM_setValue("autoUse",USE_SKILL);			// these 2 lines would matter if there were a "skill!" button on the combat screen.
//			if (setCancel) GM_setValue("cancelAtEnd",1);
			document.forms.namedItem("skill").submit();
		} else {
			var skillNumber=skillList[0].options[skillList[0].selectedIndex].value;
			macrotext[0].value="abort pastround 25;skill "+skillNumber+"; repeat;";
			document.forms.namedItem("macro").submit();
		}
	}
}

function getSelectByName(name) {
	var selects = document.getElementsByTagName("select");
	return selects.namedItem(name);
}

function setToRed() {
	GM_setValue("autoUse", GM_getValue("autoUse") % 5 + 5);
	top.document.getElementsByName('charpane')[0].contentDocument.location.reload();
}

function addGlobalStyle(css) {
    var head, style;
    head = document.getElementsByTagName('head')[0];
    if (!head) { return; }
    style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = css;
    head.appendChild(style);
}

function GM_get(page, callback)
{
	GM_xmlhttpRequest({
		method: 'GET',
		url: page,
		onload:function(details) {
			if( typeof callback=='function' ){
				callback(details.responseText);
			}
		}
	});
}

function insertAttack(txt)
{
// this routine doesn't work right.  feh.
//	SGM_log("txt="+txt);
//	var pdiv = document.createElement('div');
//	pdiv.innerHTML = txt;
//	var abox = pdiv.getElementsByName('whichattack');
//	SGM_log("abox="+abox.innerHTML);
//	var fButton = document.getElementById('finisherButton');
//	fButton.appendChild(abox);
}
	
function doHalloween() {
	var stopAdvAt = GM_getValue("stopAdvAt");
	var body = document.getElementsByTagName("body")[0].innerHTML;
	
	if ((stopAdvAt > 0) && (stopAdvAt <= GM_getValue("turnsplayed") + 1)) { 
		stopAdventuring("turns complete.");
		GM_setValue("stopAdvAt",0);
	}	
	//Reset some values since combat is over
	GM_setValue("fightTurns", COUNTER);
	GM_setValue("MonsterDamage", 0);
	GM_setValue("autoHeal", GM_getValue("autoHeal") % 3);
	GM_setValue("autoUse", GM_getValue("autoUse") % 5);
	GM_setValue("aborted",false);			// just in case we managed to twiddle our thumbs outside of a macro.
	GM_setValue("alreadyMacroed",false);	// done trying to hit the macro button.
	if(GM_getValue("cancelAtEnd") == 1){
		GM_setValue("autoUse", OFF);
		GM_setValue("cancelAtEnd", OFF);
	}
	SGM_log("end-of-combat resets complete in doHalloween.");
	if (GM_getValue("repeatAdv")) {
//		SGM_log("trick-or-treating again...");
		document.forms[0].submit();
	}
}
