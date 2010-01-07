// ==UserScript==
// @name           Klick-saver Plus
// @version        1.68
// @namespace      http://kobe.cool.ne.jp/yehman/
// @homepage       http://www.frogorbits.com/kol/
// @copyright      © 2010 Nathan Sharfi, Shawn Yeh, and Nick England
// @license        GPL; http://www.gnu.org/copyleft/gpl.html
// @author         Shawn Yeh (http://kobe.cool.ne.jp/yehman/)
// @author         Nick England
// @contributor    CDMoyer
// @contributor    adiabatic (http://www.frogorbits.com/)
// @contributor    Hellion
// @include        *kingdomofloathing.com/main_c.html
// @include        *kingdomofloathing.com/main.html
// @include        *kingdomofloathing.com/game.php
// @include        *kingdomofloathing.com/fight.php*
// @include        *kingdomofloathing.com/charpane.php
// @include        *kingdomofloathing.com/adventure.php*
// @include        *kingdomofloathing.com/choice.php
// @include        *kingdomofloathing.com/account.php
// @exclude        forums*kingdomofloathing.com
// @include        http://127.0.0.1:*
// @description    This script adds buttons to your charpane which let you select Auto(W)eapon, (I)tem, (S)kill, (A)dventure, (H)eal, (O)lfact, and/or (Q)uit on. Hover your mouse over each button to see what it does when clicked or double-clicked.
// ==/UserScript==

const COUNTER = 1;  		//-1: off  0: start on zero  1: start on one
const AUTO_USE_LIMIT = 26;	//the default round at which autoUse will be temporarily disabled
const SAFETY_NUMBER = 1.8;	//This is extra safety factor which is used with monster damage
const STOP_LIST = "abridged dictionary, "+
			"pail of pretentious paint, "+
			"pretentious paintbrush, "+
			"pretentious palette, "+
			"plus sign, "+
			"box of birthday candles, "+
			"eldritch butterknife, "+
			"dodecagram, "+
			"S.O.C.K., "+
			"mosquito larva, "+
			"wussiness potion, "+
			"ruby W, "+
			//"chaos butterfly, "+
			"sonar-in-a-biscuit, "+
			"baseball, "+
			"enchanted bean";

// The event manager will unload all registered event on page unload, including itself.
// Note only by using addEventListener(target,...) will the event be registered, and not
// target.addEventListener(...), as the prototype function was not replaced.
var registeredEventListeners = new Array();
addEventListener(window, 'unload', unregisterEventListeners, false);

switch(document.location.pathname) {
  case "/main_c.html":
  case "/game.php":
  case "/main.html":
	GM_log("Initialize Values.");
	GM_setValue("autoUse", 0);		//0: off  1: weapon  2: item  3: skill 4: heal 5: olfact 6: quit
	GM_setValue("repeatAdv", 0);		//0: off  1: normal  3: stop on specific item drops
	GM_setValue("fightTurns", COUNTER);
	GM_setValue("stopAdvAt", 0);
	GM_setValue("adventuresLeft", 0);
	GM_setValue("storedSkill", 'none');
	GM_setValue("MP",0);
	GM_setValue("HP",0);
	GM_setValue("MaxHP",0);
	GM_setValue("MaxMP",0);
	GM_setValue("skillCost",1);
	GM_setValue("cancelAtEnd",0);
	GM_setValue("autoHeal",0);		//0: off(white)  1: on(green)  2: half(dark green)  4-5: warn(red)
	GM_setValue("MonsterDamage",0);	//Smallest Monster damage recieved from this fight
	GM_setValue("keepHPHigh",0);		// set > 0 for healing at XX below max HP
	if (!GM_getValue("turnLimit")) GM_setValue("turnLimit", AUTO_USE_LIMIT);
	if (!GM_getValue("finisher")) GM_setValue("finisher", 0);
	break;

  case "/charpane.php":
	drawButtons();
	break;

  case "/fight.php":
	var div = document.getElementsByTagName("b")[0]; if (!div) return;
	var body = document.getElementsByTagName("body")[0].innerHTML;
//----------------------
// Notes to the maintainer:
// the GM value "olfact" is a flag to indicate whether the olfaction button is set to active or not.
// It gets set (or cleared) only in the button-click processing section.
// 
// "olfactGo", on the other hand, is a flag to indicate whether or not we are interested in olfacting something RIGHT NOW.
// It is set whenever we load the sidepane and "On the TraiL" is not found.
// It is cleared whenever we actually olfact something.

// first, a check to see if we had to save the old selected skill in order to olfact something last round.
	if(GM_getValue("oldskill")) {	// if yes, then we have to switch back to the old skill now.	
		var oldskill = GM_getValue("oldskill");
		var sel = document.getElementsByName("whichskill")[0];
		var opts = sel.childNodes; var len = opts.length;
		for(var i=0; i<len; i++) {
			if(opts[i].value == oldskill) {
				sel.selectedIndex = i;
				break;
			}
		}
		GM_setValue("oldskill", false);
		GM_setValue("olfactGo", 0);	// safety setting:  If we're putting back the old skill, disable olfaction manually for this round just in case the sidepane hasn't been updated yet.
	}

//	GM_log("olfact="+GM_getValue("olfact"));
//	GM_log("olfactGo="+GM_getValue("olfactGo"));
	if(GM_getValue("olfact") && GM_getValue("olfactGo")) {	// If the Olfaction button is on, and "On the trail" is not a current effect:
		var monname = document.getElementById("monname");
		if(monname && monname.innerHTML.toLowerCase().indexOf(GM_getValue("olfactString").toLowerCase()) != -1) {  // this is what we're after?
			GM_setValue("olfactGo", 0);
			addEventListener(window, 'load', function() {
				var sel = document.getElementsByName("whichskill")[0];
				var opts = sel.childNodes; var len = opts.length; var found = false;
				for(var i=0; i<len; i++) {
					if(opts[i].value == 19) {
						found = true;
						GM_setValue("oldskill", opts[sel.selectedIndex].value);
						sel.selectedIndex = i;
						document.forms.namedItem("skill").submit();
						break;
					}
				}
				if(!found) return;
			}, true);
			return false;
		}
	}
	
	if(GM_getValue("stopGo"))
	{	if(document.body.innerHTML.indexOf(GM_getValue("stopString")) != -1)
		{	GM_setValue("repeatAdv", false);
			//GM_setValue("stopGo", false);
			return false;
	}	}
//-----------------------
	if(GM_getValue("fightTurns") == COUNTER)
		grabMPHP();

	if (!body.match(/Adventure Again |Go back to /g)){
		var turns = GM_getValue("fightTurns");

		//Adds Round Counter to page, set COUNTER to -1 to turn counter off
		if (COUNTER >= 0){
			strTurns = " - " + (turns >= AUTO_USE_LIMIT ? "<span style=\"color:red;\">" + "Round " + turns + "</span>" : "Round " + turns);
			div.innerHTML += strTurns;
		}
		
		addInputButtons();

		grabCombatInfo();

		doCombat();
	}
	//end of combat
	else 
		doAutoAdv();
	break;

  case "/adventure.php":
  case "/choice.php":
	if(GM_getValue("repeatAdv"))
		doAutoAdv();
	break;

  case "/account.php":
	setPrefs();
	break;
}

function drawButtons() {

	//render the button layout
	// the variable needtoolfact is a flag to indicate whether or not "On the Trail" is a currently active effect (i.e. are we already olfacting something).  If True, then we need to olfact ASAP.
	var needtoolfact = false;
	var fullTest = document.getElementsByTagName("a")[0]; if (!fullTest) return;
	if (fullTest.innerHTML.indexOf("/otherimages/") == -1){		// lacking a graphic from the otherimages directory, we assume that we are in Compact Mode.
//		GM_log("did not find /otherimages/: assume compact mode");
		var insertAt = document.getElementsByTagName("hr")[0];
		var newHr = document.createElement('hr');
		newHr.setAttribute('width','50%');
		insertAt.parentNode.insertBefore(newHr, insertAt.nextSibling);
		var test = document.getElementsByTagName("body")[0].innerHTML.substr(document.getElementsByTagName("body")[0].innerHTML.indexOf("Adv</a>:") + 33, 4);
		var adventuresLeft = parseInt(test);
		if(GM_getValue("olfact")) {
			needtoolfact = true;
// find "On the Trail" in compact mode by using the Alt tags on images.
			var imgs = document.getElementsByTagName('img'); var len = imgs.length;
			for(var i=0; i<len; i++) {
//				if(imgs[i].src.indexOf("/footprints.") != -1)
//				GM_log("alt["+i+"]="+imgs[i].alt);
				if (imgs[i].alt.indexOf("On the Trail") != -1) {
					needtoolfact = false; i=len; break; 
				}
			}
			if(needtoolfact) GM_setValue("olfactGo", true);
			else GM_setValue("olfactGo", false);
		}
	} else {		// otherwise, we are in Full Mode.
		var insertAt = document.getElementsByTagName("table")[0];
		var adventuresLeft = parseInt(document.getElementsByTagName("span")[3].innerHTML);
		if(GM_getValue("olfact")) {
			needtoolfact = true;
// find "On the Trail" in full mode by using the description text in the font tags.
			var effs = document.getElementsByTagName('font'); len = effs.length;
			for (i=0;i<len;i++) { 
//				GM_log("effs["+i+"]="+effs[i].innerHTML);
				if (effs[i].innerHTML.indexOf("On the Trail") != -1) { 
					needtoolfact = false; i=len; break;
				} 
			}
			if (needtoolfact) GM_setValue("olfactGo",true);
			else GM_setValue("olfactGo", false);
		}
	}
	GM_setValue("adventuresLeft", adventuresLeft);
	var newTable = document.createElement('table');
	var buffer = "<tr><td title='click to autoattack'>W</td>" +
				 "<td title='click to auto-use your last-used item'>I</td>" +
				 "<td title='click to automatically use your last-used skill'>S</td>" +
				 "<td title='click to automatically adventure again; double-click to auto-adventure for a set number of rounds'>A</td>" +
				 "<td title='click to autoheal'>h</td>" +
				 "<td title='click to automatically olfact a monster'>O</td>" +
				 "<td title='click to quit on seeing some text'>Q</td></tr>";
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
	newTable.setAttribute('id','buttonbox');
	newTable.innerHTML = buffer;
	var tdArray = newTable.getElementsByTagName("td");
	if ((GM_getValue("autoUse") % 4) > 0)
		tdArray[GM_getValue("autoUse") % 4 - 1].setAttribute('class',(GM_getValue("autoUse") < 4)?'on':'warn');
	if (GM_getValue("repeatAdv"))
		tdArray[3].setAttribute('class',(GM_getValue("repeatAdv") < 2)?'on':'half');
	if (GM_getValue("stopAdvAt") < adventuresLeft && GM_getValue("stopAdvAt") > 0)
		tdArray[3].innerHTML = adventuresLeft - GM_getValue("stopAdvAt");
	if (GM_getValue("autoHeal"))
		tdArray[4].setAttribute("class",(GM_getValue("autoHeal") < 3)?((GM_getValue("autoHeal") == 1)?'on':'half'):'warn');
	if (GM_getValue("keepHPHigh"))
		tdArray[4].innerHTML = "H";
	if (GM_getValue("olfact"))
		tdArray[5].setAttribute('class','on');
	if (GM_getValue("stopGo"))
		tdArray[6].setAttribute('class','on');

	
	//add button functions
	for (var i=0; i<tdArray.length; i++){
		switch (i) {
		   case 0:
			addEventListener(tdArray[i], 'click', function(event) {
				if (GM_getValue("autoUse") % 4 == 1){
				  GM_setValue("autoUse", 0);
				  this.setAttribute('class','off');
				}else{
				  GM_setValue("autoUse", 1);
				  this.setAttribute('class','on');
				  this.nextSibling.setAttribute('class','off');
				  this.nextSibling.nextSibling.setAttribute('class','off');
				}
			}, true);
			addEventListener(tdArray[i], 'dblclick', function(event) {
				var turnLimit = parseInt(prompt('Stop Auto-Doing Stuff after XX Rounds... (1-29)'));
				if (turnLimit > 1 && turnLimit < 30 )
					GM_setValue("turnLimit", turnLimit);
				else
					GM_setValue("turnLimit", AUTO_USE_LIMIT);
			}, true);
		      break;
		   case 1:
			addEventListener(tdArray[i], 'click', function(event) {
				if (GM_getValue("autoUse") % 4 == 2){
				  GM_setValue("autoUse", 0);
				  this.setAttribute('class','off');
				}else{
				  GM_setValue("autoUse", 2);
				  this.setAttribute('class','on');
				  this.nextSibling.setAttribute('class','off');
				  this.previousSibling.setAttribute('class','off');
				}
			}, true);
		      break;
		   case 2:
			addEventListener(tdArray[i], 'click', function(event) {
				if (GM_getValue("autoUse") % 4 == 3){
				  GM_setValue("autoUse", 0);
				  this.setAttribute('class','off');
				}else{
				  GM_setValue("autoUse", 3);
				  this.setAttribute('class','on');
				  this.previousSibling.setAttribute('class','off');
				  this.previousSibling.previousSibling.setAttribute('class','off');
				}
			}, true);
		      break;
		   case 3:
			addEventListener(tdArray[i], 'contextmenu', function(event) {
				if (event.button == 2){
					event.stopPropagation();
					event.preventDefault();
				}
			}, false);
			addEventListener(tdArray[i], 'mousedown', function(event) {
				if (event.button == 2 && GM_getValue("repeatAdv") != 3){
				  GM_setValue("repeatAdv", 3);
				  this.setAttribute('class','half');
				}else if (event.button == 0 && GM_getValue("repeatAdv") != 1){
				  GM_setValue("repeatAdv", 1);
				  this.setAttribute('class','on');
				}else{
				  GM_setValue("repeatAdv", 0);
				  this.setAttribute('class','off');
				}
			}, true);
			addEventListener(tdArray[i], 'dblclick', function(event) {
				var adventureLimit = parseInt(prompt('Auto-adventure for how many turns?'));
				if (adventureLimit > adventuresLeft) adventureLimit = adventuresLeft;
				else if (adventureLimit < 0 || !adventureLimit) adventureLimit = 0;
				if (adventureLimit > 0) {
					GM_setValue("stopAdvAt", adventuresLeft - adventureLimit);
					GM_setValue("repeatAdv", 1);
					this.innerHTML = adventureLimit;
					this.setAttribute('class','on');
				}else if (adventureLimit == 0){
					GM_setValue("stopAdvAt", 0);
					GM_setValue("repeatAdv", 0);
					this.innerHTML = 'A';
					this.setAttribute('class','off');
				}
			}, true);
		      break;
		   case 4:
			addEventListener(tdArray[i], 'contextmenu', function(event) {
				if (event.button == 2){
					event.stopPropagation();
					event.preventDefault();
				}
			}, true);
			addEventListener(tdArray[i], 'mousedown', function(event) {
				if (event.button == 2 && GM_getValue("autoHeal") != 2){
				  GM_setValue("autoHeal", 2);
				  this.setAttribute('class','half');
				}else if (event.button == 0 && GM_getValue("autoHeal") != 1){
				  GM_setValue("autoHeal", 1);
				  this.setAttribute('class','on');
				}else{
				  GM_setValue("autoHeal", 0);
				  this.setAttribute('class','off');
				}
			}, true);
			addEventListener(tdArray[i], 'dblclick', function(event) {
				var KeepHPhighInput = parseInt(prompt('AutoHeal at XX below max HP?'));
				if (KeepHPhighInput > 0) {
					GM_setValue("keepHPHigh", KeepHPhighInput);
					this.innerHTML = "H";
				}
				else{
					GM_setValue("keepHPHigh", 0);
					this.innerHTML = "h";
				}
			}, true);
			break;
		   case 5:
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
				if(monster == undefined) monster = '';
				monster = prompt('Transcendently Olfact which monster?', monster);
				if (monster && monster != '') {
					GM_setValue("olfactString", monster);
					GM_setValue("olfact", true);
					this.setAttribute('class','on');
				} else {
					GM_setValue("olfactString", '');
					GM_setValue("olfact", false);
					this.setAttribute('class','off');
				}
				event.stopPropagation();
				event.preventDefault();
			}, true);
		    break;
		   case 6:
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


// Try to read in MP and HP values from the charpane
//
function grabMPHP() {
	var charpaneDoc = top.document.getElementsByName('charpane')[0].contentDocument.getElementsByTagName("body")[0];
	if (!charpaneDoc) return;
	var pageBodyText = charpaneDoc.innerHTML;
	var HP = pageBodyText.match(/onclick='doc\("hp"\);'>(?:<[^<]+>)*(\d+)(?:<[^<]+>)*(?:\&nbsp;)?\/(?:\&nbsp;)?(\d+)<\/span>/);
	var MP = pageBodyText.match(/onclick='doc\("mp"\);'>(?:<[^<]+>)*(\d+)(?:<[^<]+>)*(?:\&nbsp;)?\/(?:\&nbsp;)?(\d+)<\/span>/);
	
	// Set HP values.
	if (HP) {
		GM_setValue("HP", Number(HP[1]));
		GM_setValue("MaxHP", Number(HP[2]));
	}
	else {
		GM_log("grabMPHP(): Error - Regex used to extract HP/MaxXP failed to match anything.");
	}
	
	// Set MP values.
	if (MP) {
		GM_setValue("MP", Number(MP[1]));
		GM_setValue("MaxMP", Number(MP[2]));
	}
	else {
		GM_log("grabMPHP(): Error - Regex used to extract MP/MaxMP failed to match anything.");
	}
}

function addInputButtons() {
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
			//GM_log("Gained "+curGain+" MP, current MP: "+GM_getValue("MP"));
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
			//GM_log("Healed " +curHeal+ " HP, current HP: "+GM_getValue("HP"));
			if(GM_getValue("HP") > GM_getValue("MaxHP") && !(i == HealText.length -1 && pageBodyText.indexOf("Your Jalape") != -1))
				GM_setValue("HP",GM_getValue("MaxHP"));
		}
	}
		
	//This section grabs MP loss
	var MPLossText = pageBodyText.match(/You lose \d+ (?=Muscularity|Mana|Mojo)/g);
	if(MPLossText){
		var curLoss = Number(MPLossText[0].slice(8,-1));
		GM_setValue("MP", GM_getValue("MP") - curLoss);
		//GM_log("Loss MP: "+curLoss);
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
			//GM_log("MDam: "+GM_getValue("MonsterDamage") +", current HP: "+GM_getValue("HP"));
		}
	}
}

function doCombat() {
	if (GM_getValue("fightTurns") < GM_getValue("turnLimit")) {

		var useThis = GM_getValue("autoUse") % 4;
		var healThis = GM_getValue("autoHeal") % 3;
		GM_setValue("autoUse",useThis);
		GM_setValue("autoHeal", healThis);
		if((healThis == 2 && useThis > 0 && useThis < 4) || healThis == 1)
			doAutoHeal();
		switch(useThis) {
			case 1:
			  addEventListener(window, 'load', function() { document.forms.namedItem("attack").submit(); }, true);
			break;
			case 2:
			  addEventListener(window, 'load', function() {
				var itemChosen = getSelectByName("whichitem").selectedIndex;
				if (itemChosen == 0){
					setToRed();
					return;
				}
				document.forms.namedItem("useitem").submit(); 
			  }, true);
			break;
			case 3:
			  addEventListener(window, 'load', function() { 
				var whichSkillRef = getSelectByName("whichskill");  if (!whichSkillRef) return;
				if (whichSkillRef.options[whichSkillRef.selectedIndex].value.match(/4014|3009/g)){
					for(var i = 0; i < whichSkillRef.length; i++)
						if(whichSkillRef.options[i].value == GM_getValue("storedSkill"))
							whichSkillRef.selectedIndex = i;
					//GM_log("Using storedSkill: "+GM_getValue("storedSkill"));
				}
				if (whichSkillRef.selectedIndex == 0){
					setToRed();
					return;
				}
				var costText = whichSkillRef.options[whichSkillRef.selectedIndex].text.match(/\d+/g);
				if (costText){
					GM_setValue("skillCost", Number(costText[0]));
					GM_setValue("MP", GM_getValue("MP") - costText[0]);
				}
				document.forms.namedItem("skill").submit();
			  }, true);
			break;
			default:
				GM_log("whuh?");
			break;
		}
	}else if (GM_getValue("finisher") != 0){
		  addEventListener(window, 'load', function() { 
			if (GM_getValue("finisher") == 1){
				//this.document.attack.submit();
				document.forms.namedItem("attack").submit();
				return;
			}
			var whichSkillRef = document.getElementsByName("whichskill")[0];
			
			if (!whichSkillRef) return;
			
			for(var i = 0; i < whichSkillRef.length; i++)
				if(whichSkillRef.options[i].value == GM_getValue("finisher"))
					whichSkillRef.selectedIndex = i;
			GM_log("Using finisher: "+GM_getValue("finisher"));
			if (whichSkillRef.selectedIndex == 0){
				setToRed();
				return;
			}
			var costText = whichSkillRef.options[whichSkillRef.selectedIndex].text.match(/\d+/g);
			if (costText)
				GM_setValue("MP", GM_getValue("MP") - costText[0]);
			document.forms.namedItem("skill").submit();		
//			this.document.skill.submit(); 
		  }, true);
	}else
		setToRed();
	GM_setValue("fightTurns", ++turns);
}


// Automatically heal when fighting
//
function doAutoHeal(){
	if(GM_getValue("MonsterDamage") * SAFETY_NUMBER + 2 >= GM_getValue("HP") || (GM_getValue("keepHPHigh")>0 && GM_getValue("HP") + GM_getValue("keepHPHigh") <= GM_getValue("MaxHP"))){
		var returnAutoUse = GM_getValue("autoUse");
		GM_setValue("autoUse", 0);
		//GM_log("Trying to Heal HP="+GM_getValue("HP")+" threshold is "+GM_getValue("MonsterDamage") * SAFETY_NUMBER + 2);
		addEventListener(window, 'load', function() {
			var SalveAvailable = 0;
			var BandageAvailable = 0;
			var skillIndex = this.document.skill.whichskill.selectedIndex;
			//GM_log("Selected skillIndex: " + skillIndex);
			for(var i=0; i < this.document.skill.whichskill.length; i++){
				if(this.document.skill.whichskill.options[i].value == 4014)
					SalveAvailable = i;
				if(this.document.skill.whichskill.options[i].value == 3009)
					BandageAvailable = i;
			}
			if (skillIndex != 0 && skillIndex != SalveAvailable && skillIndex != BandageAvailable){
				var selectedSkill = this.document.skill.whichskill.options[skillIndex].value;
				if (selectedSkill){
					GM_setValue("storedSkill", selectedSkill);
					GM_log("Remembering storedSkill: " + GM_getValue("storedSkill"));
				}
			}
			if(SalveAvailable > 0)
				this.document.skill.whichskill.options.selectedIndex = SalveAvailable;
			else if(BandageAvailable > 0)
				this.document.skill.whichskill.options.selectedIndex = BandageAvailable;
			else {
				GM_setValue("autoHeal", GM_getValue("autoHeal") + 3);
				GM_setValue("autoUse", returnAutoUse);
				if (!GM_getValue("keepHPHigh"))
					GM_setValue("repeatAdv", 0);
				top.document.getElementsByName('charpane')[0].contentDocument.location.reload();
				return;
			}
			var costText = this.document.skill.whichskill.options[skillIndex].text.match(/\d+/g);
			if (costText)
				GM_setValue("MP", GM_getValue("MP") - costText[0]);
			GM_setValue("autoUse",returnAutoUse);
			this.document.skill.submit();
		},true);
	}
}


// Automatically click the Adventure Again button from the fight screen
//
function doAutoAdv() {
	grabCombatInfo();
	//GM_log("MP: "+GM_getValue("MP")+".  skillCost: "+GM_getValue("skillCost"));
	//GM_log("HP: "+GM_getValue("HP")+".  MonsterDamage: "+GM_getValue("MonsterDamage"));
	//GM_log("[doAutoAdv]stopAdvAt: "+GM_getValue("stopAdvAt")+" adventuresLeft: "+GM_getValue("adventuresLeft"));
	var body = document.getElementsByTagName("body")[0].innerHTML;
	var aquiredStuff = body.match(/item: <b>[^<]+/g);
	if (GM_getValue("repeatAdv") == 3 && aquiredStuff){
		for (var i = 0; i < aquiredStuff.length; i++){
			//GM_log("item" +i+ ": " + aquiredStuff[i].slice(9));
			if (STOP_LIST.indexOf(aquiredStuff[i].slice(9)) >= 0)
				GM_setValue("repeatAdv", 0);  //stop-listed item aquired
		}
	}
	if ( (GM_getValue("MP") < GM_getValue("skillCost") && GM_getValue("autoUse")%4 == 3)//MP less than cast amount
	   ||(GM_getValue("stopAdvAt") == GM_getValue("adventuresLeft") - 1)			//Auto-adventure limit reached
	   ||(GM_getValue("HP") < 1)										//Beaten up
	   ||(GM_getValue("repeatAdv") == 3 && body.match(/You gain (?:a|some) Level/g))	//Level up
	   ||(GM_getValue("MonsterDamage") * 1.1 >= GM_getValue("HP"))				//Monster can kill you in one hit
	   )
		GM_setValue("repeatAdv", 0);

	if (GM_getValue("repeatAdv"))
		addEventListener(window, 'load', function() {
			var anchors = document.getElementsByTagName("a");
			for (var i = 0; i < anchors.length; i++)
				if (anchors[i].getAttribute("href").indexOf("adventure.php") != -1) {
					document.location = document.links[i];
					break;
				}
		}, false);
	//Reset some values since combat is over
	GM_setValue("fightTurns", COUNTER);
	GM_setValue("MonsterDamage", 0);
	GM_setValue("autoHeal", GM_getValue("autoHeal") % 3);
	GM_setValue("autoUse", GM_getValue("autoUse") % 4);
	if(GM_getValue("cancelAtEnd") == 1){
		GM_setValue("autoUse", 0);
		GM_setValue("cancelAtEnd", 0);
	}
}

function setPrefs() {
	// newButton sets the skill to use when turnLimit is reached.
	var newBr = document.createElement('br');
	var newButton = document.createElement('input');
	//for (var i = 0; i < whichAttack[0].options.length; i++)
	//	GM_log(whichAttack[0].options[i].text);
	newButton.setAttribute('class','button');
	newButton.setAttribute('value',(GM_getValue("finisher") == 0)?'Change Finisher':'Finisher - '+finisherName(GM_getValue("finisher")) );
	newButton.setAttribute('type','button');
	newButton.setAttribute('style','margin-top:.1em;');
	newButton.setAttribute('id','newButton');
	addEventListener(newButton, 'click', function(){
		GM_setValue("finisher", document.getElementsByName("whichattack").value);
		this.value = "Finisher - " + finisherName(GM_getValue("finisher"));
	}, true);
	var inputArray = document.getElementById('autohelp').getElementsByTagName('input');
	for (var i = 0; i < inputArray.length; i++)
		if(inputArray[i].value == 'Change Auto-Attack'){
			inputArray[i].parentNode.appendChild(newBr);
			inputArray[i].parentNode.appendChild(newButton);
		}

	//This function to parse the skill name from the text
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


// Memory-Leak-free event handling
//
// Registering event handlers with node.addEventHandler causes memory leaks.
// Adding via this function tracks them all, so they can be removed
// when the page unloads.
function addEventListener(target, event, listener, capture)
{
    //GM_log('registering: '+ event);
    registeredEventListeners.push( [target, event, listener, capture] );
    target.addEventListener(event, listener, capture);
}
function unregisterEventListeners(event)
{
    for (var i = 0; i < registeredEventListeners.length; i++)
    {
        var rel = registeredEventListeners[i];
        //GM_log('unloading: ' + rel[1]);
        rel[0].removeEventListener(rel[1], rel[2], rel[3]);
    }
    window.removeEventListener('unload', unregisterEventListeners, false);
}

function AttackScript() {
	GM_setValue("autoUse",1);
	GM_setValue("cancelAtEnd",1);
	document.forms.namedItem("attack").submit();
}

function ItemScript() {
	GM_setValue("autoUse",2);
	GM_setValue("cancelAtEnd",1);
	document.forms.namedItem("useitem").submit();
}

function getSelectByName(name) {
	var selects = document.getElementsByTagName("select");
	return selects.namedItem(name);
}

function setToRed() {
	GM_setValue("autoUse", GM_getValue("autoUse") % 4 + 4);
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

