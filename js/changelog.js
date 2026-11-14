// Player-facing changelog shown on the main menu (data only).
// Part of the game script; loaded by index.html in a fixed order (see the list there).

const WOD_CHANGELOG = [
    {at:"2026-11-14T18:23:48Z",title:"Supporter Pack and tutorial polish",items:[
        "The $10 in-game Supporter Pack is available in Buy gold, with Patron Gold designs for every unit and era plus 5,000 gold. Existing supporters keep their ownership; the separate Steam DLC is being retired.",
        "Tutorial prompts step aside when Menu, Stats or Cities is open. Starting troops appear immediately, and holding Redwater for 75 game seconds completes the counterattack step even if an attacker remains outside town."
    ]},
    {at:"2026-11-14T12:00:00Z",title:"Guided tutorial, a new guide and steadier matches",items:[
        "New players can learn the game in a short guided battle: Tutorial & help on the main menu (shown first until you have played a match) walks you through moving troops, taking towns, recruiting, buildings and supply, pointing at each part of the screen as it comes up.",
        "The guide has been rewritten from scratch for new players, with contents at the top, a close button that stays in view and Esc to close.",
        "The campaign no longer has difficulty levels; every campaign plays at the former Normal settings. Campaigns already in progress keep going.",
        "If something goes wrong during a battle, the game now reports it and keeps running instead of freezing.",
        "Online results count only when no other player's game disputes them, and the server limits how much and how fast each connection can send."
    ]},
    {at:"2026-11-14T02:19:38Z",title:"Retreats around friendly lines",items:[
        "Retreating and routing troops keep steering around allies even when an enemy is close behind them.",
        "Blocked retreats plan short routes around nearby troops instead of repeatedly aiming at an occupied cell. Detours keep their corners and resume the original retreat destination.",
        "Units reconsider blocked detours when other troops move into the route, and take a shorter route when a gap opens."
    ]},
    {at:"2026-11-14T00:44:07Z",title:"Bridges you draw, continents and mountain passes",items:[
        "Drag a bridge from bank to bank in any direction, or tap both banks. The preview shows its price and length: $1,000 per water cell, up to four cells, with a 60-second construction time. Existing saved bridges still work.",
        "Continents maps place two large landmasses across an open sea, with equal land per player and a port town for each side. Generated skirmish and multiplayer maps now offer one to four towns per player.",
        "Shared-landmass borders follow land routes, and starting towns are spread across each faction's territory with equal counts for all players.",
        "Units navigate tight mountain corners more reliably and try to clear blocked passes without abandoning their destination.",
        "AI armies defend threatened forts and hospitals and send relief troops without waiting for a full assault formation."
    ]},
    {at:"2026-11-13T01:17:10Z",title:"Supply cordons, town recovery and landing parties",items:[
        "Enemy troops guarding the gap behind a frontline unit can cut its short supply link. Ordinary troops in townless coastal pockets still need land supply; marines retain their water-supply exception.",
        "Wounded troops can recover on all friendly town streets, including streets painted without town IDs on authored maps.",
        "Retreating troops try wider routes around comrades when movement stalls.",
        "Fully recovered units clear stale retreat states; the complete changelog is numbered chronologically from Version 1.0 in 0.1 steps.",
        "AI landing parties pursue nearby towns together, while field armies place forts and recovery support near useful positions."
    ]},
    {at:"2026-11-12T21:41:31Z",title:"Troop-held ground and completed town captures",items:[
        "Land troops claim the tile beneath them even when defenders stand on adjacent tiles. Opposing troops on the same tile still contest it, and adjacent defenders still block surrounding claims.",
        "AI troops finish walking through undefended towns and commit appropriately sized parties to lightly defended towns where they already have a foothold.",
        "Frontline units retain supply when supplied friendly land is within two land tiles, including when the tile beneath them has just been captured."
    ]},
    {at:"2026-11-12T20:39:29Z",title:"Frontline supply and more active field armies",items:[
        "Units advancing onto contested enemy land stay supplied while connected friendly land is within two land tiles. Deeper advances and disconnected friendly pockets still need a route to a friendly town; the rule applies to every faction.",
        "AI armies attempt wider encirclements, take undefended ground in pairs and rotate tired troops out of combat. Wounded attackers stay committed when recovery support is nearby.",
        "Large AI armies receive movement orders sooner, with less repeated planning."
    ]},
    {at:"2026-11-12T19:18:10Z",title:"Supply-aware assaults and coordinated flanks",items:[
        "AI commanders account for morale, choose firing positions that can remain supplied, and regroup to reopen supply routes when their forces are cut off.",
        "Stronger forces can send wings around a battle, pursue retreating enemies and support nearby fighting; commanders adapt their assault estimates after taking or failing to take towns.",
        "The field commander now operates in authored missions while respecting scripted reinforcement marches."
    ]},
    {at:"2026-11-11T23:00:00Z",title:"Decisive AI, faster simulation, lighter multiplayer",items:[
        "AI commanders now cut supply lines. When your troops stray from their towns, one enemy unit shadows them while another marches across the ground behind them; a closed pocket starves quickly, so watch your corridors.",
        "An AI with a clearly stronger army masses it, pins the defenders from cover and sends a wing round the town instead of trickling in small groups. Undefended towns are taken on sight.",
        "Troops on a connected landmass no longer wait for ferries they do not need.",
        "Movement and terrain lookups are faster, most noticeably in large battles and at high game speed.",
        "Multiplayer snapshots are much smaller, and a Steam host that alt-tabs or minimizes no longer freezes the match for everyone else."
    ]},
    {at:"2026-11-10T22:45:00Z",title:"Steadier defense and committed assaults",items:[
        "Defensive screens keep useful assignments while the threat remains. Remote corridor warnings no longer commandeer unrelated attacking squads; immediate town relief and real supply escapes keep priority.",
        "Pinning forces choose their next objective when a battle clears. Viable assaults move into the whole town instead of getting caught in nearby skirmishes.",
        "Firing-position choices place more weight on unit-specific cover and avoiding crossfire. Small seven-unit armies remain coherent, while larger armies retain separate attacking squads.",
        "AI supply-cut planning recognizes known coastlines around narrow land corridors. Budget-limited flank searches resume on later ticks instead of discarding the maneuver.",
        "Defended objectives can receive enough nearby independent cohorts for a viable assault. Reserves support the same battle as casualties rotate out, instead of locking themselves into a second weak waiting group."
    ]},
    {at:"2026-11-10T20:30:00Z",title:"Wider attacks and less rear-line crowding",items:[
        "AI squads reserve firing positions across the whole battle and use openings along the visible enemy line, reducing competing orders to the same cell.",
        "Larger armies form smaller attacking cohorts. Joint attacks stop adding helpers once sufficient strength is committed; unused squads can capture separate open sectors while a viable force holds the contact.",
        "New pressure orders retain their route long enough to advance instead of immediately rejoining a crowded rally. Winning assault troops can make short forward bounds into firing range.",
        "Squads opening a new sector keep their town objective and return to attack it from the flank. Town assaults retain attacking strength before releasing extra squads."
    ]},
    {at:"2026-11-10T12:00:00Z",title:"Steadier armies and purposeful attacks",items:[
        "AI mission lookups no longer cancel queued movement. Recovery keeps control of wounded troops, and ordinary offensive orders preserve their group while they heal.",
        "Coherent survivors can occupy nearby weak objectives and continue advancing. Cohesion checks stop unsupported charges into visible opposition without parking units on an empty front.",
        "Corridor withdrawals require a ground threat that can actually reach the passage. Encircled troops use danger-aware retreat routes and retain the escape until they reach safe ground.",
        "Loaded invasion forces wait for required supply ships and escorts that are physically approaching, with a bounded recovery window for stalled waves. Marines retain one naval controller at a time.",
        "Affordable replacements for understrength attacking squads can precede a distant armor purchase. Nearly funded armor, opening infrastructure and required invasion logistics keep their funding.",
        "Staged ambushes turn refused lures into legal flanking attacks sooner. Leaner intelligence snapshots, shared roster lookup and corridor-search buffers reduce late-game AI work."
        ,"Troops returning from traffic sidesteps can realign inside their current cell and route around parked units while retaining their original waypoint destination."
    ]},
    {at:"2026-11-10T03:00:00Z",title:"Two-tile naval repair and reliable supply cutoffs",items:[
        "Warships, transports and supply ships repair only within two tiles of a friendly-held town cell or inside a friendly hospital radius. Combat and manpower requirements still apply. AI and rallied ships seek water inside those same repair areas.",
        "Removing the final bridge invalidates its cached city connection. Isolated troops start their warning and attrition sequence; restoring a real corridor clears it. Neutral-land cleanup also refreshes supply connectivity.",
        "Inland encirclement checks use current land connections instead of waiting for old pocket-scan flags. Ordinary coastal capture, marine water supply and valid diagonal land corridors keep their existing rules."
    ]},
    {at:"2026-11-10T02:15:00Z",title:"Stable frontlines and safer campaign routing",items:[
        "Collision separation, idle yielding and spawn spacing keep frontline troops on their friendly side of the border. Passive nudges cannot turn a supplied position into enemy territory or an unwanted swim; deliberate move and attack orders can still advance.",
        "Campaign infantry and armor can complete morale withdrawals even when a distant enemy is behind them. They rally and return for healing once pursuit ends, using the same morale rules as skirmish.",
        "Retreat routes weigh travel time, terrain and exposure to visible enemy weapons, avoid occupied enemy positions and keep the chosen detour around guarded passes. Routes adjust when new contacts appear or enemies move, while retaining the retreat destination. Fog-of-war limits apply."
    ]},
    {at:"2026-11-10T00:50:00Z",title:"Safe bridge retreats and accurate isolation",items:[
        "Manual retreats and morale routs use visible enemy positions, check the withdrawal legs and prefer a safe bank. Groups reserve separate destinations; a blocked bank no longer sends troops through enemy units.",
        "Direct water orders beside bridges remain water orders even inside the bridge's padded routing cells. Ordinary land units can enter deliberately ordered water and return to reachable land; dry formations keep avoiding unwanted swims.",
        "Bridge supply requires an actual dry connection to the deck. Padded bridge cells no longer send supply across open water to nearby shores, so disconnected troops receive the same two-second confirmation and ten-second attrition countdown as other isolated units."
    ]},
    {at:"2026-11-09T23:50:00Z",title:"Defended construction and coastal withdrawals",items:[
        "Attackers cannot flip a cell while an adjacent defending unit still contests it, including hospital construction sites. Capture is checked again after all units move, and resumes once the defenders are defeated or withdraw.",
        "Short retreats work on narrow coastal strips and exposed ground even when every nearby friendly cell touches the front. Retreat routes respect terrain and can leave water for a reachable friendly shore.",
        "Stranded land units choose a complete route to their destination shore instead of landing on an intervening island and getting stuck. Route smoothing and friendly sidesteps preserve the shore-exit route; bridges remain usable."
    ]},
    {at:"2026-11-09T20:48:58Z",title:"Infrastructure-first AI openings",items:[
        "Every AI personality prioritizes factories in both starting towns on its first purchase cycle, then farms as each town and its budget become available.",
        "Opening construction funds are protected from routine troop spending. Factories unlock armor and motorized infantry, while farms support manpower for continued recruitment.",
        "Immediate town attacks, critically thin defenses and urgent naval rescue can override new infrastructure spending. Buildings still use normal costs and 60-second construction. Captured towns do not restart the opening build order."
    ]},
    {at:"2026-11-09T18:53:05Z",title:"Fighting retreats and reliable shore movement",items:[
        "Retreating and routed troops return fire within range while continuing their withdrawal. Low morale still reduces their damage, and fighting pauses medical treatment.",
        "Friendly traffic can clear retreating bridge columns. Marines can pass one another in open water and resume their original landing route after a sidestep.",
        "Stranded land troops can reach shore after route rebuilds or interrupted boarding, including beside bridge decks. Dry formations still avoid unintended swimming.",
        "Viable AI town defenders hold contested urban ground instead of abandoning it for routine recovery. Critically wounded and routed units can still withdraw."
    ]},
    {"at":"2026-11-09T07:25:22.637Z","title":"Committed attacks and calculated losses","items":["AI commanders accept closer fights for known towns, supply cuts and territorial gains, with their individual caution still affecting decisions.","An assault can keep moderately wounded troops fighting while it makes progress. Critical wounds, routing, excessive losses and threatened supply routes still trigger recovery.","Healthy armies no longer stop solely because recent battles cost troops. Two supplied survivors can finish a nearby weak objective instead of waiting for a third regiment."]},
    {at:"2026-11-09T06:21:15.671Z",title:"Reliable orders and coordinated operations",items:[
        "Idle marines can return to town-connected coasts. Critically wounded troops receive an escape order when treatment yields to a threatened supply corridor.",
        "Neighboring understrength squads reorganize into viable forces. Trap wings use real arrival times and can close verified supply cuts around pinned enemies.",
        "Boarding tracks actual progress and avoids stalled embarkation points. Safe landing retries get time to move before a ferry returns home; expedition purchases prioritize missing operational support.",
        "Movement reuses exact collision checks and fast dry-terrain tests. Marines share terrain reachability components, with terrain edits invalidating the cache."
    ]},
    {at:"2026-11-09T03:19:06.746Z",title:"Committed offensives and complete naval operations",items:[
        "Field troops form stronger independent squads. Joint assaults keep a viable fixing line, and arriving flank troops close into the ongoing battle before choosing another objective.",
        "Idle marines receive coastal transfers or new land objectives. Evacuations reserve real ferries, including routes to inland towns through a reachable coast.",
        "Disconnected seas retain separate expeditions. Marine waves use distinct landing positions, and beachheads scout inland under fog. Completed objectives retain loaded ferries until disembarkation or recovery.",
        "Island rescue checks actual supply-ship arrival time. Exposed supply ships seek protection or evacuation; medical travel follows prepared land and bridge routes.",
        "Sea route searches resume unfinished work. Traps react to observed approach, convert refused lures into flanks, and can close a verified supply choke with one viable wing."
    ]},
    {at:"2026-11-08T23:35:00Z",title:"Stronger field forces and dependable naval waves",items:[
        "Thin front lines recruit affordable infantry before duplicate armor. Counter-armor demand reflects nearby known threats, and stalled specialist savings release their budget.",
        "Nearby assault squads share a safe rendezvous. Depleted formations regroup available survivors, and wounded roster members no longer block replacements.",
        "Idle marines reconsider stale paths, seek weaker reachable objectives or regroup. Supported naval waves can bring their general while keeping town guards at home.",
        "Town-bound marine raids gather at least two troops and finish the crossing for trailing members after their vanguard lands. Existing supply-ship escort and safe landing checks remain in force.",
        "Threatened supply corridors trigger a coordinated assault withdrawal. Troops already committed to combat can be flanked without first following an ambush lure.",
        "Map generation shares exact town-placement distance and connectivity calculations. Combat arrival estimates reuse terrain speeds within each search. Movement, supply, fog and combat rules are unchanged."
    ]},
    {at:"2026-11-08T21:12:00Z",title:"Sustained campaigns and dependable invasion planning",items:[
        "Town campaigns retain their capture objective through tactical pauses. Temporary failed approaches become eligible again when their cooldown expires.",
        "Specialist recruitment keeps savings that are making real funding progress. Stalled budgets and urgent defense still release the reservation.",
        "Inland troops and town centers can locate their coast correctly. A known town on another island no longer restarts an active landing every planning scan.",
        "Invasions account for paid construction and actual assembly movement before timing out. Long crossings can retain a progressing mission.",
        "Stranded relief troops and isolated patients can seek supply again. A supported breakout keeps its command; a stalled breakout is reassessed.",
        "Ambush safety considers reinforcements able to arrive promptly. Forward marches resist backwards formation corrections while responding to nearby combat and real emergencies.",
        "AI land orders wait for their dry detour when route work is incomplete, then use that prepared route instead of an unintended water crossing."
    ]},
    {at:"2026-11-08T17:45:00Z",title:"Reliable AI advances and adaptive naval assaults",items:[
        "Healthy field formations reassess abandoned holds and recover useful objectives. Garrisons, medical recovery, prepared traps and active fixing forces retain their duties.",
        "Veteran marines start each new raid with its own progress clock. A stale timer from an earlier mission can no longer cancel a new crossing immediately.",
        "When an opponent refuses an ambush lure, prepared troops can turn it into a safe flanking attack. Trap triggers account for the enemy contacts still present.",
        "Loaded transports have individual progress limits, so a moving fleet mate cannot leave another boat waiting forever. Stranded cargo can return and unload safely.",
        "Corridor reinforcements check actual terrain travel time before promising to defend a supply link. Cut-off troops beyond the local search can seek a dry escape toward their own cities."
    ]},
    {at:"2026-11-08T09:34:09.841Z",title:"Wider AI fronts and coordinated pincers",items:[
        "Nearby squads share firing, staging and march reservations with enough room for their actual unit sizes. Large formations deploy across wider lines instead of stacking behind five columns.",
        "Crowded battles keep a sufficient fixing force while independent squads take safe left and right flanks. Additional squads seek a separate stretch of front when one is available.",
        "Flanking squads check their real fixing force, current supply routes, visible opposition and known terrain. Town guards, recovering troops and emergency defenders keep their duties.",
        "A reassigned squad no longer receives commands from an obsolete joint assault. Stalled campaign objectives use actual progress and a retasking cooldown to avoid repeated resets."
    ]},
    {at:"2026-11-08T18:00:00Z",title:"AI mission recovery and sustained offensives",items:[
        "Idle marines recover land objectives or return to shore. Abandoned loaded transports retry safe landings or return and unload; active invasion preparations retain their safety checks.",
        "Repeated orders no longer count as marine-raid progress. Stalled raids and unaffordable specialist savings expire, freeing troops and resources for useful missions.",
        "Attack groups keep movement intent across routine phase changes, close with nearby supporting troops, and reassess stalled objectives instead of waiting indefinitely.",
        "Landed troops and marines seek an escape when genuinely cut off from supply. Recruitment savings reserve manpower while limited, paid medical replacements continue.",
        "Ambush wings can close after enemies capture the baited center. Retreat routes and wings must remain supplied, and unsafe or refused traps still release their troops."
    ]},
    {at:"2026-11-08T02:59:19Z",title:"Protected pushes and supporting squads",items:[
        "Nearby ready troops now count when protecting an attack's supply corridor, before they start firing. Protected routes retain a screen without recalling most of the attacking army.",
        "Defensive orders use the current corridor assessment as troops arrive. Uncovered routes, distant reserves and stronger enemy pincers still trigger emergency defense and withdrawal.",
        "Town defenders take formation and firing lanes from their battlefield positions, preventing crossed orders caused by unit numbering. A town battle shares its nearby corridor screen instead of splitting the same defenders between duplicate responses.",
        "Squads recognize nearby comrades already moving toward the same fight. Small contacts can be engaged with real incoming support; idle or unreachable troops do not count."
    ]},
    {at:"2026-11-08T02:00:00Z",title:"Committed assaults and reliable naval follow-through",items:[
        "Attacking groups recover and regroup near their current front instead of returning to an obsolete rally. Small target changes preserve useful movement orders.",
        "Manpower shortages prioritize safe farm investment, while recruitment and medical replacements share the real resource pool. Recovering regiments can return to their groups before every last casualty is replaced.",
        "Naval forces keep a stable coastal landing point and retain inland objectives longer. Ground troops cut off from city supply seek a supported escape before attrition begins.",
        "Ambushes require complete wings and tolerate a wounded bait unit when the overall force remains viable. An exposed trap with no safe closing route can convert to a supported counterattack."
    ]},
    {at:"2026-11-07T14:59:32Z",title:"More active fronts and selective group support",items:[
        "Coherent attacking groups close the distance toward weaker opposition instead of waiting to already be in fighting range. Isolated leaders, inferior forces and threatened supply routes retain their safety checks.",
        "Large armies form more separate attacking forces. Small leftover detachments join a nearby viable group rather than waiting on solo jobs, while town guards keep their posts.",
        "Joint assaults use only the supporting forces needed for the battle. Helpers stage from their own positions and flank while other groups keep capturing land; one weak enemy no longer gathers several armies into one mass.",
        "Active flank maneuvers can retain a viable fixing force while their wings advance. Unreachable troops across a river no longer freeze another land objective, while enemies able to fire across the gap still count as threats."
    ]},
    {at:"2026-11-07T05:13:00Z",title:"Steadier AI operations and naval recruitment",items:[
        "Committed attack groups keep their missions through routine border alerts. Dedicated screens still defend the countryside, while real town attacks, trapped armies and imminent supply cuts can interrupt an offensive.",
        "Flanking traps assemble complete wings and allow time for useful staging progress. Temporary collision detours no longer leave a staging wing waiting indefinitely.",
        "AI troop savings persist through busy production queues. Recruitment and medical replacements share a deliberate manpower budget, with continued treatment and emergency line recruitment; planned naval escorts can now be funded.",
        "Marine raids receive travel-aware time limits and continue toward their inland objective after landing. Regrouping repairs missing defensive anchors instead of crashing on changing island fronts.",
        "Archipelago generation spends less time retrying unsuitable coastlines and town placements while retaining equal land, city spacing and strict border validation."
    ]},
    {at:"2026-11-05T19:24:43Z",title:"Stronger town defense and coordinated fire",items:[
        "Observed enemy troops are assigned to one town approach at a time. Reachable secondary towns receive a proper relief force instead of an arbitrary two-unit cap; garrisons and supply screens keep their duties.",
        "Small or urgently depleted armies release specialist savings to recruit affordable line troops, while upkeep and production restrictions remain enforced.",
        "AI combat groups coordinate fire against visible enemies in actual weapon range, finish vulnerable targets and spread excess fire. This preserves movement, retreat and naval orders and uses the same combat rules as the player.",
        "Town counterattacks prefer usable cover within firing range. All commanders retain fog of war and the same resources, damage and supply mechanics as players."
    ]},
    {at:"2026-11-05T18:02:00Z",title:"Persistent squads and coordinated AI assaults",items:[
        "Attack squads retain their members while troops heal or answer an emergency. Returning troops and recruits rejoin the same squad; real casualties still allow depleted formations to regroup.",
        "Two or three neighboring squads can coordinate a shared assault, with a fixing force and separate flanking approaches. They launch together using actual travel times and observed opposition, while preserving their individual rosters.",
        "A shared command decision controls assembly, attack and recovery. Distant troops, garrisons and patients cannot authorize a fight; nearby allies already fighting the same battle contribute to its strength estimate. Short defense commitments reduce repeated reassignment between towns.",
        "Victorious forces prioritize reachable towns and exposed structures. Strategic progress checks distinguish meaningful approach and urban capture from small territorial gains. Recruitment follows stable squad requirements and accounts for reinforcements already being built."
    ]},
    {"at":"2026-11-05T16:00:38Z","title":"Attack pursuit and more active AI fronts","items":["Click, right-click or tap an enemy with troops selected to order an attack. Units replace their old march, seek firing positions and follow the visible target; approaching troops can disengage from other fights at 75% movement speed.","Pursuit respects terrain and fog. Hidden enemies are followed only to their last seen position. New movement or retreat orders cancel pursuit; Clear target stops it, and destroyed targets release their attackers. Attack orders synchronize in multiplayer.","The AI keeps a leaner standing screen on quiet fronts and releases excess healthy defenders and reserves into attacking forces. Town garrisons, medical recovery, active combat and urgent defense retain their duties.","Idle troops a few tiles behind an empty front can join safe territorial advances instead of waiting outside the old search range. Separate small forces and nearby combat support remain in place."]},
    {"at":"2026-11-05T09:54:02Z","title":"Smaller armies, separate objectives and nearby support","items":["AI attacks use several persistent forces, usually three to six units and capped at eight, with separate approach lanes and objectives instead of one oversized army.","Viable groups keep their own missions. Town assaults, land advances and flanking forces no longer all get redirected toward the same city; only small fragments regroup.","One nearby force can temporarily help a neighboring battle without merging their rosters. Other forces keep their objectives, and the helper resumes its mission after combat clears.","Combat support preserves fog of war, arrival checks, supply, garrisons, medical recovery, deliberate flanks and urgent defense duties."]},
    {"at":"2026-11-05T09:01:58Z","title":"Diagonal corridors, steady retreats and building information","items":["Single-cell diagonal land connections now carry movement and city supply for every side. Corner sampling no longer strands a unit on neighboring water; a truly severed land route still loses supply.","Automatic morale retreats use the same short fallback as the Retreat button and keep their destination until arrival. Pursuit can trigger a further short fallback after that bound.","Factories, farms, harbors, forts, hospitals and bridges have information buttons with their own costs, construction times, bonuses and placement/use guidance, including in the city list.","Idle front units cautiously take supplied empty land until they approach actual enemy weapon range. Town guards, medical recovery, active marches and urgent defense retain their duties.","Cached HUD rate lookups and routing flash artwork remove repeated DOM searches and per-frame image filtering from large battles."]},
    {
        at:"2026-11-05T08:10:16Z",
        title:"Targeted combat, morale retreats and recruitment information",
        items:[
            "Selected troops can prefer an enemy unit without losing their movement orders. They fight the nearest visible enemy when that target is out of range, then switch back when it returns. Target orders synchronize in multiplayer.",
            "Unit cards show current speed and combat stats. Infantry has a 1.0× base, armor 0.9× and motorized infantry 1.1×; other classes use 1.0×. Waterlogged troops move at 90%. General command grants 5% combat and morale bonuses and 10% speed, without stacking.",
            "Morale drains slightly faster. Units flash white and retreat automatically at 20 morale, keep fleeing pursuers, rally after recovering and seek treatment for wounds. Morale can recover away from towns; HP and manpower still require safe town or hospital care.",
            "Every recruitment button has an independent information button showing era names, costs, build time, stats and terrain effects before buying, including when the purchase is unavailable. Help explains the updated rules."
        ]
    },
    {
        at:"2026-11-05T04:37:24Z",
        title:"AI armies commit to their fronts",
        items:[
            "Routine guard and reserve rebalancing keeps active assault formations together instead of repeatedly dismantling them while they march. Fresh recruits fill defensive gaps.",
            "Temporary defense screens now draw from the matching enemy front. Nearby combat, town relief, breakouts and substantial imminent supply cuts retain emergency authority."
        ]
    },
    {
        at:"2026-11-05T03:23:02Z",
        title:"AI groups support their fighting units",
        items:[
            "Healthy nearby regiments now interrupt old rally and march orders to support combat involving their own group, using separate firing positions and actual travel times.",
            "Reinforcements finish their approach when the first regiment briefly disengages. Town guards, supply withdrawals, healing troops and planned encirclement wings keep their duties; dangerous fights and hidden enemies do not trigger support attacks."
        ]
    },
    {
        at:"2026-11-05T02:54:51Z",
        title:"AI feints and baited encirclements",
        items:[
            "Commanders can stage two flanking forces in friendly terrain and use a healthy bait unit to draw an approaching enemy into an encirclement. Generals support the maneuver and are never used as bait.",
            "Flanks close from their current positions once pursuers enter the trap, while the bait withdraws behind its support. In fog, troops scout a closing lane using ordinary vision.",
            "Traps require suitable troops, supply and a favorable fight. Refused bait, dangerous reinforcements, wounded bait, lost flanks or urgent defense cancel the attempt; armies then resume ordinary combat and advances. Retreating enemies remain pursuit targets."
        ]
    },
    {
        at:"2026-11-05T01:57:33Z",
        title:"AI captures undefended border land",
        items:[
            "Idle border troops, reserves and understrength attack groups take short advances onto undefended enemy land instead of waiting for a full assault force. They continue capturing while the route stays connected to a friendly city.",
            "Troops choose separate capture cells, retain their direction as the border moves and widen their foothold. Fog advances use visible ground and observed threats; enemy contact, threatened supply, garrisons, recovery and existing movement orders retain priority."
        ]
    },
    {
        at:"2026-11-05T01:35:20Z",
        title:"AI front-line commitment",
        items:[
            "Small AI armies can commit their available reserve to form a viable three-regiment attack instead of waiting indefinitely at an open front. Larger forces retain a reserve; garrisons, emergency defenders and combat-strength checks remain in effect.",
            "Overlapping supply-cut warnings share defenders when the same entrances protect the same troops, freeing surplus soldiers for the advance. Each cut still retains its own withdrawal warning, and separate flanks receive separate protection."
        ]
    },
    {
        at:"2026-11-05T00:43:00Z",
        title:"AI momentum after successful attacks",
        items:[
            "Victorious armies stop tracing obsolete encirclement routes around cleared or overwhelmed opposition and continue toward reachable towns or territory as a supported force.",
            "Capturing a town adds its garrison without rebuilding the surviving army's groups. Losing assets, urgent defense, medical recovery and dangerous opposition still trigger the appropriate response.",
            "Quiet territory pushes retain their direction through several cells instead of circling the nearest edge. New objectives use the surviving roster and exclude garrisons and emergency defenders."
        ]
    },
    {
        at:"2026-11-04T23:38:20Z",
        title:"Coordinated AI armies and purposeful movement",
        items:[
            "AI units keep stable defensive positions and formation slots instead of rebuilding nearby orders every pulse. Genuine advances, retreats, emergency defense and lost ground still release the hold.",
            "Blocked factories no longer reserve money away from usable rear towns. Savings have a deadline, and operation reinforcements request suitable units from towns that can deliver them to the intended front.",
            "Invasion strength and logistics are evaluated within a reachable sea region. Fleets cannot count disconnected escorts or select unreachable islands; scouts explore outward to find crossing opportunities.",
            "Commander caution applies consistently to front attacks and assaults. A shared mission controller handles temporary defensive loans without permanently dissolving the original groups.",
            "Attack groups track territory captured, combat results and objective progress. Stalled operations change their approach or request support; flanking routes can detour around obstacles, target real supply cuts and reroute around observed interception.",
            "Fog planning uses movement inferred from sightings, shorter bounds into hidden approaches and fading naval memories. Moderately wounded troops rotate through recovery, critical patients withdraw, and depleted groups can receive recovered replacements sooner."
        ]
    },
    {
        at:"2026-11-04T22:43:00Z",
        title:"AI regrouping and steadier advances",
        items:[
            "Understrength ground attack plans release their surviving troops so nearby remnants can regroup into a viable advancing force. Separate two-unit plans no longer reserve each other's reinforcements and stall on an undefended front.",
            "Small armies scout with their advancing force instead of permanently dedicating too many infantry to patrols. Unneeded ground scouts rejoin useful groups once an enemy town is discovered; larger armies retain reconnaissance when needed.",
            "Town guards, recovery, urgent defense, naval operations and separate enemy-front assignments retain priority. Ground attacks still require support and connected supply."
        ]
    },
    {
        at:"2026-11-04T22:06:31Z",
        title:"Coordinated pursuit and defense across multiple threats",
        items:[
            "Supported AI groups pursue beaten, retreating enemies instead of stopping at the previous battle position. Pursuit follows current visible contacts, advances in short bounds and stops for unfavorable battles, threatened supply routes or lost support.",
            "Border defense reserves separate nearby groups for different enemy approaches before spending the remaining troops on larger battles. Urgent town relief receives a viable force first. Assigned defenders obey their new defense orders, while superior forces already fighting keep pressure on their opponents.",
            "Ordinary ground advances require at least three troops. Unsupported vanguards hold supplied ground while their rear units catch up, and lone ground scouts stay near the friendly frontier. Town guards, encirclement wings and naval landing operations retain their assignments."
        ]
    },
    {
        at:"2026-11-04T21:16:33Z",
        title:"Earlier AI encirclement prevention",
        items:[
            "AI now detects threatened supply passages against coasts and map edges as well as between two enemy flanks, including broad advances. It guards the enemy-facing entrance rather than sending defenders to the sea.",
            "Nearby defenders cover a passage when they can hold it; exposed troops begin withdrawing while a route home remains open when timely protection is insufficient. Enemy marine raids also trigger supply-route and town defense.",
            "Coastal marines keep their supply exemption, captured friendly towns still supply their connected troops, and hidden enemies do not trigger omniscient retreats. Defense analysis retains its work budget across frames."
        ]
    },
    {
        at:"2026-11-04T20:08:59Z",
        title:"Separate AI armies and coordinated encirclements",
        items:[
            "Larger AI armies form several independently led assault forces instead of concentrating most attackers into one group. Nearby understrength groups still combine, while town guards, recovery and emergency defense retain priority.",
            "Forces prioritize visible enemies already engaged in combat, hold them with a pinning group and attempt one or two flanking routes when strength, terrain and supply permit. Neighboring forces avoid duplicating the same flanking lane.",
            "After an objective, attackers continue in smaller formations with separate movement orders. Reinforcements join their assigned force without recalling its leading troops or mixing assignments between AI nations."
        ]
    },
    {
        at:"2026-11-04T07:48:00Z",
        title:"Smoother battles and accurate frontline supply",
        items:[
            "AI defense, pocket and broad-flank analysis runs in small batches across frames, sharing one CPU budget at every game speed. Units keep their orders while the next defense plan is prepared.",
            "Supply reuses unchanged land and bridge connections instead of rebuilding them on every periodic scan. Repeated route estimates and redundant HUD color updates are avoided, and tactical work yields between regiments.",
            "Troops standing on visibly friendly rounded frontline corners use the matching friendly land connection. Genuine encirclements, corner-only contacts, water attrition and bridge supply rules remain in effect for players and AI."
        ]
    },
    {
        at:"2026-11-04T06:00:00Z",
        title:"Reliable landings, recovery and steady unit artwork",
        items:[
            "Landing craft repair interrupted pickups and stalled unloading routes for players and AI. Blocked shores receive a wider reachable search, and invalid boarding reservations release both units.",
            "Naval recruitment uses the actual invasion roster. Marine raids and warship fleets do not request unneeded landing craft or supply ships; ordinary troop invasions retain a funded wave, its seats, escorts and supply coverage.",
            "Marines leave completed island objectives, clear abandoned raid orders and retry stalled marching legs. Wounded marines can return across water for treatment without purchasing a ferry.",
            "Wounded retreating troops continue to a real town or hospital instead of stopping after a short fallback. Lost treatment sites release stale recovery orders. Unit artwork keeps a fixed size while nearby troops move, removing the growing and shrinking effect.",
            "Coastal group clicks, drawn formations and queued waypoints keep land-connected regiments on land, including marines. Formation offsets no longer turn shore waypoints into accidental water orders; explicit water destinations still work.",
            "Naval assaults continue to remaining towns on the same island. Passing enemy vessels stop recruitment or town healing only when exchanging fire with troops on its town cells. Vessels repair within three hexes of the nearest friendly town cell, with no harbor required."
        ]
    },
    {
        at:"2026-11-04T04:15:00Z",
        title:"Stable enemy fronts, town relief and marine objectives",
        items:[
            "Troops retain assignments to individual enemy fronts. Mixed groups split by front, each front can run its own offensive, and ordinary replanning or a town changing hands no longer redirects the whole army toward a different opponent.",
            "Simultaneous town attacks receive local relief assessed by combat strength. Supply screens balance their defenders across both ends of a threatened corridor. Relief troops can counterattack a recently overrun town instead of abandoning their mission immediately.",
            "Landed marines choose persistent objectives: cutting a real enemy supply corridor, capturing a weak town and its urban cells, or expanding their beachhead. Routine naval planning no longer ends a successful raid after an arbitrary short shore timeout.",
            "Spectators can rejoin with their original report, without recording another defeat. Online multiplayer outcome totals use the relay's match receipts, and late readiness or host-transfer messages cannot restart a completed battle."
        ]
    },
    {
        at:"2026-11-04T03:18:04Z",
        title:"Committed encirclements and post-defeat spectating",
        items:[
            "Supported armies coordinate up to 48 mobile troops around larger enemy groups. Their holding force moves into combat while enclosing wings advance, and a breakthrough can change into an encirclement when it encounters visible defenders. Town guards, supply defense and retreat safeguards remain in place.",
            "After defeat or surrender, choose to spectate or exit if at least two other factions remain. This works in singleplayer and multiplayer, including when the eliminated player is hosting. Spectators can follow the whole battlefield, revisit their result and leave at any time.",
            "Your personal result is recorded once. Multiplayer observers cannot command units and can reconnect to watch; the simulation transfers to another connected player when its host leaves. The original report returns when the remaining battle ends."
        ]
    },
    {
        at:"2026-11-04T00:30:00Z",
        title:"AI keeps its frontline gains",
        items:[
            "Frontline troops keep advancing into reachable weakly defended land after a capture, instead of returning to an old rally point. Quiet-line assignments follow their troops' current positions.",
            "Supply-corridor defenses preserve their identity and wing assignments as the tested crossing shifts. Guards no longer repeatedly swap roles or take small repositioning orders after reaching a defensive slot. Genuine emergencies still interrupt advances."
        ]
    },
    {
        at:"2026-11-03T21:00:00Z",
        title:"Stronger flanks and defensive responses",
        items:[
            "Armies can flank along one open side when a coast, river or mountain blocks a full encirclement. Larger forces coordinate up to 32 troops, retaining a fixing force while their wings advance on connected land routes.",
            "Town relief and territorial defense scale to the observed enemy's combat strength. Defenders form an interception line and counterattack with troops already nearby, while distant reinforcements join without delaying a viable response. Town and fort guards remain protected."
        ]
    },
    {
        at:"2026-11-03T20:07:33Z",
        title:"Tight large-army formations",
        items:[
            "Large formations use close gaps sized for each neighboring pair of units. A tank no longer widens every infantry gap in the army, and shortening a line packs large selections as closely as small ones.",
            "Near coasts, map edges and occupied ground, the planner fits the whole line into nearby reachable space before spreading individual positions. The preview shows the fitted line and every selected unit receives its assigned destination when the line fits.",
            "Unit assignment follows the line direction for large selections too. Packed map counters reduce visual clutter while keeping their collision sizes, stats and movement unchanged."
        ]
    },
    {
        at:"2026-11-03T16:58:00Z",
        title:"Minimum formation gestures stay in one line",
        items:[
            "Short formation drags no longer become ordinary group moves with multiple rows. Drag recognition uses screen distance at every zoom level, and clicking or tapping in Formation mode places a compact single line.",
            "Mouse, touch and waypoint formation controls share the same rule. Previews distinguish normal group moves from lines and show the actual destinations before committing."
        ]
    },
    {
        at:"2026-11-03T08:17:00Z",
        title:"Accurate line formations and shorter land routes",
        items:[
            "Drawn formations stay in one line. Short drags expand just enough to fit the selected unit counters with small gaps, and the preview shows the actual assigned positions. Ordinary, queued waypoint and multiplayer line orders share the same layout.",
            "Land routes use real distance and terrain movement effects, without artificial detours around nearby mountains or attraction to cheap bridge tiles. Clear dry marches can start directly, and the path search keeps stable priorities as better routes are found.",
            "Route smoothing preserves useful motorized and mountaineer terrain detours instead of cutting straight through slower ground. Friendly avoidance continues to preserve commanded destinations and waypoint legs."
        ]
    },
    {
        at:"2026-11-03T07:12:19Z",
        title:"Reliable group destinations and friendly traffic",
        items:[
            "Group moves assign nearby units to separate reachable positions, with room to pass through arriving ranks. Selection order no longer makes the group crisscross itself, and short formation lines use additional ranks instead of stacking units together.",
            "Each unit follows its own terrain-aware route instead of an offset copy of the group leader's route. Queued orders show their destination immediately, and a newer command cancels an older queued march. Multiplayer host orders use the same destination assignment.",
            "Friendly avoidance predicts actual movement before bodies touch. Temporary yielding preserves every player destination and waypoint, reserves return positions and resumes when traffic clears. Arriving player units finish at their assigned position instead of silently stopping short."
        ]
    },
    {
        at:"2026-11-02T22:49:22Z",
        title:"Sustained offensives and purposeful field hospitals",
        items:[
            "Healthy, supplied AI armies choose follow-up objectives without repeatedly rebuilding their assault. Advancing operations retain their orders while making real progress, and moderate battle damage alone no longer discards a viable force.",
            "AI troops target exposed enemy forts and hospitals, including short detours from a town assault. Field structures must be discovered under fog of war, and nearby known defenders still affect attack decisions.",
            "Hospital investment depends on wounded ground troops and uncovered recovery needs. Ships do not increase the hospital limit. Existing and planned hospitals reserve their service area, and new sites require supply, a setback from hostile land and distance from enemy weapons."
        ]
    },
    {
        at:"2026-11-02T21:47:50Z",
        title:"Coordinated breakthroughs and enclosing wings",
        items:[
            "Nearby land groups commit to a shared front operation, including mobile frontline troops that previously waited in separate small formations. Rear reinforcements join the existing advance without recalling its leading troops.",
            "Commanders concentrate against a reachable weak section and can make a short supported probe against an evenly matched front. A substantially stronger assembled army can pin an observed enemy concentration with armor while two separate wings capture connecting corridors and meet behind it.",
            "Town and fort guards, urgent town defense, supply relief and medical care retain priority. Offensives respect fog of war, dry terrain and actual force strength, and abandon a sustained disadvantage. Successful groups hand their old line positions forward instead of returning to the old border."
        ]
    },
    {
        "at": "2026-11-02T18:22:31.510Z",
        "title": "Marine flanking raids and stronger land pressure",
        "items": [
            "Marines can raid exposed enemy shores on the same continent or other islands, sailing through open water to land behind the front and capture territory or a rear town. New marines join an existing wave instead of remaining idle or restarting it.",
            "Naval launch decisions use the force actually gathered and the known defenders. A ready marine pair can sail while ordinary cargo waits for supply; ordinary troops retain their transport and supply requirements.",
            "Coastal commanders recruit a small marine force for useful flanks without buying unnecessary ferry seats or supply boats. Raids respect fog of war, seek routes around known hostile fleets, scout alternatives when an invasion is waiting for escorts, and withdraw from an observed interception.",
            "Quiet surplus frontline guards reinforce attacks while keeping required line coverage, reserves and every town's infantry guard. Healthy screens make short safe land probes instead of waiting because distant enemies might eventually approach; nearby resistance still stops unsupported advances."
        ]
    },
    {
        at:"2026-11-02T17:20:00Z",
        title:"Formed assault advances and accurate riverbank orders",
        items:[
            "AI armies gather around their actual troops before moving to the enemy, rather than sending scattered regiments to a distant rally. Route calculation no longer preserves a stale rally across the map.",
            "Advancing assault groups use shared forward bounds with distinct line and second-rank positions. Reinforcements join the existing advance, and troops that have passed a bound do not reverse to an old slot. Combat, town defense and supply emergencies still take priority.",
            "Riverbank movement stays on dry ground, including land beneath bridge end caps. Nearby land clicks no longer snap to a bridge's center, and marines can complete short moves within the same bank cell. Necessary bridge crossings remain supported."
        ]
    },
    {
        at:"2026-11-02T17:00:00Z",
        title:"Gold participation, equal march speed and purposeful attacks",
        items:[
            "Match gold requires at least 60 active seconds and damage dealt to an enemy by that player. Ineligible results explain why no gold was earned. Pauses and faster game speed do not satisfy the time requirement sooner.",
            "All units now share infantry's base movement speed, including armor, specialists and ships. Existing saves adopt the same speed. Terrain, water and morale still affect movement; general command and veterancy no longer increase it.",
            "Healthy lone frontline screens cautiously advance over unopposed land instead of waiting forever for another unit. They stop probing when enemy resistance appears; town guards, reserves and supply emergencies remain protected.",
            "Nearby stalled attack groups choose a shared reachable production objective and concentrate against it. A border fight already covered by a superior assault no longer recalls the same troops into a duplicate defensive holding task. Real incursions and threatened towns still receive defensive responses."
        ]
    },
    {
        at:"2026-11-02T10:00:00Z",
        title:"Slower experience and active frontline armies",
        items:[
            "Combat experience is earned at half its previous rate for every faction and unit class. Existing experience and the 25/50/100 XP rank milestones are preserved.",
            "Frontline groups advance together over weak or unguarded ground while retaining town guards, reserves and emergency supply defenses.",
            "Gathered assault forces can deploy before every regiment is already in firing support range. Superior armies move into contact; inferior armies still regroup or withdraw.",
            "Engaged armies reassess enemy supply corridors and coordinate opposing wings to close achievable encirclements, including during town assaults. Fog-of-war limits still apply."
        ]
    },
    {
        at:"2026-11-02T08:00:00Z",
        title:"Steadier AI marches and sustained counterattacks",
        items:[
            "Reinforcements keep their front-line assignment while travelling instead of returning to reserve before arrival. Urgent town and supply-cut responses still take priority.",
            "Territory defense tracks the observed invading group as it moves, preserving assignments and counterattacking when the gathered force can win. Outnumbered defenders gather or withdraw rather than charging alone.",
            "Routine command refreshes preserve a continuing assault and its progress. Formation positions and rally leaders stay stable. Withdrawals last long enough to reach safe ground instead of repeatedly turning back halfway.",
            "AI ground troops resume their original destination after making room for friendly traffic, instead of returning to the sidestep point."
        ]
    },
    {
        at:"2026-11-02T07:20:00Z",
        title:"Natural terrain joins and reliable encirclements",
        items:[
            "Supply follows real land corridors and completed bridge links for both factions. Corner-only contacts through hostile flanks no longer supply trapped troops or generals; friendly stair-step corridors and held town supply still work.",
            "Checkerboard frontlines form complete rounded rings instead of four broken ends. Empty diagonal tips are tidied without transferring occupied cells, towns or structures or opening artificial supply routes.",
            "Generated terrain resolves alternating mountain, forest and plain corners. Older maps render those joins with rounded edges; water corners never create a fake land bridge."
        ]
    },
    {
        at:'2026-11-02T02:00:00Z',
        title:'Connected town supply, active reserves and clearer structures',
        items:[
            'Friendly diagonal land connections now carry supply for every faction. Towns supply through their held urban cells while under siege, even if their center is contested. Water gaps still need a real bridge or naval support.',
            'Quiet reserves and spare line troops reinforce reachable front-line battles while town guards stay assigned. Nearby stalled assault groups can combine into a useful force instead of waiting on separate distant objectives.',
            'Hospitals now have a compact footprint comparable to forts. Generals use a purple command radius; their gold star remains visible. Battle reports show every unit class separately, including infantry, marines, warships, transports and supply ships.'
        ]
    },
    {
        at:'2026-11-01T21:00:00Z',
        title:'Hospital combat rules and wider offensive flank cover',
        items:[
            'Units stop hospital recovery while firing or receiving enemy fire. Safe patients elsewhere in the same hospital radius can keep healing. This applies equally to every faction and to naval repair.',
            'AI supply defense checks broad salients across the map, beyond short choke points. Threatened wings request reinforcements sized to the opposing force, and each end needs timely cover before exposed attackers continue.',
            'When the army cannot hold a closing route, endangered formations fall back toward city supply before the pocket closes. Larger threats can recall more attackers without stripping town garrisons.'
        ]
    },
    {
        at:'2026-11-01T20:20:00Z',
        title:'Steam and browser startup fix',
        items:[
            'Fixed a launch error in the menu background battle: its AI now has an initialized construction queue before checking hospital needs.',
            'The main menu remains available if the optional background battlefield fails to load.'
        ]
    },
    {
        at:'2026-11-01T18:52:00Z',
        title:'Persistent offensives, river routes and coordinated invasion staging',
        items:[
            'A threatened regiment can withdraw without canceling its entire army’s attack. Strong assaults retain a short commitment while routine guard assignments shift toward newly observed pressure; town emergencies and serious supply cuts still take priority.',
            'AI rally points and movement orders follow shared land routes around rivers and through bridges. Formations have enough assembly space, scouts favor useful discoveries, and highland commanders can build factories for open-ground combined arms.',
            'Marines gather near the fleet before launching. Blocked disembarking on a captured island no longer holds the fleet indefinitely, and naval recruitment funds landing troops alongside combat escorts before extra bombardment ships.'
        ]
    },
    {
        at:'2026-11-01T12:00:00-05:00',
        title:'Town assaults, concentrated landings and protected supply',
        items:[
            'AI armies reassess discovered weak towns and keep a viable town objective while the force assembles. Quiet surplus frontline guards can reinforce attacks, and scouts keep exploring through routine land skirmishes without learning hidden enemy positions.',
            'Regiments use separate rally and approach positions. Invasion forces gather from troops actually ashore, preserve separate landing orders, include marines in the same beachhead force and keep directing marines that are already afloat.',
            'Threatened supply ships receive dedicated combat escorts and prefer screened supply positions. Known hostile warships take recruitment priority over extra ferry seats, unsafe crossings regroup, and a short last-seen fleet estimate prevents immediately forgetting a naval threat.'
        ]
    },
    {
        at:'2026-11-01T09:07:11.038Z',
        title:'Coordinated expeditions, recovery and updated missions',
        items:[
            'Naval buying follows the active expedition: marines cross independently, transports match the ordinary troops in the wave, supply ships cover actual beachheads, and warships answer naval threats and coastal resistance. Established beaches receive follow-up waves without canceling pickup routes or pulling away essential supply.',
            'Wounded island troops and generals can reserve a ferry home. Healthy town guards yield recovery space, distant patients justify funded hospitals, and healthy attackers regroup without waiting on recovering soldiers. Town healing stops while the town is attacked; supplied hospitals can treat units during combat.',
            'Forts and hospitals are destroyed when captured, with a short collapse explosion over the building, debris, dust and spatial sound. Their bonuses end immediately. The effect is synchronized in multiplayer and uses era-safe collapse audio.',
            'Nearby small assault groups concentrate, quiet territory advances keep their momentum, relief considers arrival times and a committed primary defense, and observed enemy corridors up to six cells wide can be attacked from both ends.',
            'All 34 authored missions are reviewed for current unit roles, with mobile detachments, era-appropriate rough-terrain specialists, mixed reserve waves and useful naval logistics. Historical maps, dates, objective IDs and airborne evacuation forces are preserved.'
        ]
    },
    {
        at:'2026-11-01T01:00:00-04:00',
        title:'Smarter defensive responses and follow-up invasions',
        items:[
            'AI factions protect money and manpower for missing combat classes. Threatened armies fill immediate infantry needs first, useful harbors can unlock naval production, and safe rear farms can relieve manpower shortages. Upkeep and siege rules still apply.',
            'Threatened towns draw a coordinated response with stable staging, separate firing positions and mobile reserves. Retreating groups share fallback lines and keep progressing orders instead of changing their destination every tactical pulse.',
            'Naval missions finish town footprints and hand off captured beachheads. Embarked forces retain their objectives, rendezvous along real ferry routes and choose supported unloading sites. Troops and supply ships clear unloading lanes, and older beachheads retain needed supply coverage.',
            'Naval reconnaissance continues alongside invasions, replaces blocked exploration routes and gives available warships priority over borrowed ferries. Captured towns replace outdated enemy memories and coastal operation targets.',
            'Healthy generals can join supported beachheads by transport when the home front and sea approaches are safe. Hospitals, supply ships, town garrisons and combat forecasts continue to govern those decisions.'
        ]
    },
    {
        at:'2026-10-31T22:00:00-04:00',
        title:'Reliable recruitment and stronger battlefield command',
        items:[
            'AI keeps recruiting whenever a usable town, purchase resources and future upkeep allow it. Army composition targets no longer stop production. Useful factory unlocks can happen before ten units; saving has an affordable fallback when defense is urgent or the wait grows long.',
            'Frontline coverage reflects border size and known threats. Commanders can recall assigned attackers into defense and reserves while preserving town guards. Supply analysis predicts threatened corridors up to six cells wide and compares closure time with withdrawal time.',
            'Reinforcement arrival checks follow legal terrain and bridge crossings. Marines share tactical retreat safeguards. Emergency withdrawals and relief routes take priority over routine movement requests.',
            'Land operations share assembly, approach security, flank protection, attack, consolidation and recovery stages. Understrength formations withdraw together, maintain rear screens and finish capturing every town cell before handing over to a garrison.',
            'Local bounded decision diagnostics explain recruitment, saving, idle production, defensive reassignment, corridor warnings and operation transitions. New simulations exercise continued recruitment, remote land raids, closing pincers, upkeep limits and group recovery.'
        ]
    },
    {
        at:'2026-10-31T16:00:00-04:00',
        title:'Chalkboard, Whiteboard and complete battlefield packs',
        items:[
            'Chalkboard and Whiteboard are premium map packs at 2,500 gold each. Chalkboard uses grainy chalk schematics and sketched soldiers; Whiteboard has separate filled marker illustrations, helmet badges, overhead vehicles, leafy forests and contour hills. Both convert terrain, units, structures, front lines and commands in every era for both armies.',
            'All four map packs use real screenshots captured through the game renderer from a generated skirmish, with a separate capture for every era. Default and Atlas HD share the same pack cards, unit and structure rosters, era selector and equip controls. Previews are free to browse, and owned packs can be re-equipped at no charge. Preview dialogs support phones, scrolling rosters, keyboard navigation and clear purchase feedback.',
            'Atlas HD includes its aerial unit art for both armies. The separate Atlas HD Units product and troop-style option have been removed; previous owners receive Atlas map ownership without another purchase. Default restores your chosen troop skins.',
            'Atlas mountains keep their gray rock palette with smoother curved relief, continuous foothill blending and seamless textures. The old straight ridge network, faceted highlights and individual square transition stamps have been removed. Shop captures use the updated renderer.'
        ]
    },
    {
        at:'2026-10-31T08:00:00-04:00',
        title:'Stronger frontlines and a new campaign atlas',
        items:[
            'Attacks gather 80% of their assigned group before launching. Support estimates use actual movement speed, advancing formations keep up with their leaders, and rally points move forward with secured territory.',
            'Outmatched troops fall back to supplied cover and regroup. Threatened supply corridors receive forces sized to enemy combat power; endangered troops can withdraw before a neck closes. The defense graph includes real bridge connections. Commanders seek exposed enemy supply necks that can cut off observed forces.',
            'The campaign has a shaded terrain atlas, region boundaries, route lines and clear region markers, with a new responsive command layout. Recruiting preserves button focus, scroll position and map size. Difficulty explanations show the actual resource, garrison, reward and counterattack settings below the selector.',
            'Campaign briefings correctly describe untimed skirmish assaults and full ten-minute defenses. The hospital is redrawn with distinct wards, shaded roofs, windows, an entrance and a pink medical sign.'
        ]
    },
    {
        at:'2026-10-31T00:00:00-04:00',
        title:'Coordinated commanders, supporting generals and recovery',
        items:[
            'Commanders coordinate recruitment, frontline screens, reserves and combined-arms assaults around persistent battle plans. Reinforcements fill defensive gaps as armies grow, and town guards use reachable routes. The old army cap based on town count has been replaced by economy and upkeep limits.',
            'Attack forecasts account for both combat terrains, morale, veteran experience, known forts and general support. Nearby reserves only count when they can arrive in time. Failed attacks are reconsidered; commander personalities favor different concentrations, flanks, terrain and invasion plans.',
            'Generals fight as armor while seeking clear firing positions that keep nearby troops inside their purple command radius. Wounded formations, experienced troops and generals withdraw to safe reachable recovery sites. Units wait separately at small towns, and useful rear hospitals are built and used for recovery.',
            'Naval invasions coordinate transports, landing troops, escorts and supply ships. Fleets check sea control, landing strength and supply before committing, reinforce their beachhead and advance toward entire towns once strong enough ashore. Supply ships can round coasts while covering landed troops. Medical assignments take priority, nearby water orders stay at the requested position, and crowd relief respects shorelines.',
            'Fog-aware commanders remember last-seen enemy forces with fading confidence and scout uncertain approaches without knowing hidden live positions. Large player marches no longer pause AI decisions or buying. Decision timing is consistent across game speeds and screen sizes, with bounded processing and cached defense scans.'
        ]
    },
    {
        at:'2026-10-30T23:45:00-04:00',
        title:'Unit experience, persistent profiles and multiplayer fixes',
        items:[
            'Selected unit cards show experience, rank and progress to Veteran below health and morale. Experienced units display one, two or three centered gold rank bars across the top of their map marker; Regular units have none. Training milestones are 25, 50 and 100 XP, with the existing Veteran bonus unchanged.',
            'Multiplayer surrender now ends your battle with a defeat report. A surrendering host hands control to another player; remaining factions continue playing, and results are saved once. Accidental disconnects still allow reconnection.',
            'Password-protected games now use a masked in-game password dialog with retry and cancel support for lobby listings, invites and direct links.',
            'Choose a saved browser profile or optional Steam sign-in in Your profile. Linking a new Steam account preserves that device’s progress; signing into an existing Steam profile restores its records without merging unrelated players. The Steam app signs in automatically. Profiles use durable server storage, and Steam-linked shop balances use the existing verified wallet.',
            'Single-player and multiplayer lifetime statistics have separate records and era filters. Earlier statistics that mixed both modes remain available as Earlier combined records. Steam also keeps a stable local save origin between launches.'
        ]
    },
    {
        at:'2026-10-30T23:00:00-04:00',
        title:'Campaign recruitment, supply stability and bridge orders',
        items:[
            'Campaign assaults now use normal skirmish conquest with no deadline. Defenses require surviving ten minutes while retaining a town; capturing enemy towns does not end the survival timer early. You can rebuild your army instead of losing simply because the field is temporarily empty.',
            'Recruit new troops with battlefield money and manpower, using normal factory, harbor, coastal and siege requirements. Separate Call reserves controls deploy already purchased troops without charging again. Surviving recruits fill available campaign army slots; excess survivors remain local garrisons.',
            'Supply warnings and the ten-second attrition countdown begin only after two continuous seconds of confirmed isolation. A brief frontier capture no longer flashes an encirclement warning. Bridges transmit supply from friendly cities as land corridors; they never generate it, and water beside the physical deck remains water.',
            'Land destinations near bridge approaches keep their exact location. Bridge routes no longer win automatically over a shorter dry route, avoiding unnecessary detours onto nearby crossings.'
        ]
    },
    {
        at:'2026-10-30T20:00:00-04:00',
        title:'Patron Gold, Steam gold packs and an upgraded shop',
        items:[
            'The $10 Supporter Pack includes 5,000 gold and the exclusive Patron Gold collection: engraved ivory-and-gold designs for every unit in Ancient, Medieval, Napoleonic and Modern battles. Sovereign remains a separate achievement collection with redesigned dark enamel and gold detailing; WW2 chips now show distinctive era-aware unit symbols.',
            'Steam gold bundles offer 1,000 gold for $1, 6,000 for $5 and 15,000 for $10. Purchases use Steam Wallet, verified Steam ownership and durable purchase records. Refresh purchases restores completed orders; supporter gold is granted once per verified owner.',
            'Gold prices for shop skins, missions, map cosmetics and command styles are now five times their previous prices. Already owned individual items remain yours. The supporter pack grants its exclusive collection and gold instead of unlocking the whole shop.',
            'The shop has a dedicated gold page with responsive purchase cards. Patron Gold and Sovereign era variations use the existing army dropdowns, and supply ships, transports and both specialist classes have their own artwork.'
        ]
    },
    {
        at:'2026-10-30T17:30:00-04:00',
        title:'Steam multiplayer connection',
        items:[
            'Fixed the Steam desktop app connecting to a nonexistent local multiplayer server. Steam now uses the same public relay as the web game; custom server and LAN overrides still work.'
        ]
    },
    {
        at:'2026-10-30T16:30:00-04:00',
        title:'Mixed-terrain combat, hospitals and unique generals',
        items:[
            'Combat now combines each attacker’s effectiveness on both fighters’ terrain, then applies the opponent’s cover. Unit cards show opposing terrain, fort, veteran and general effects. Motorized infantry has revised terrain strengths and weaknesses.',
            'Healing is slightly slower at 3% strength per second and requires a safe supplied town or hospital. Build hospitals for $3,000 in 60 seconds; their pink radius matches a fort. Ships repair at friendly harbors or hospitals; land units and marines cannot heal in open water.',
            'Every nation starts with one unique armor general. Its purple fort-sized radius grants a non-stacking 5% bonus to friendly attack, toughness and range. Generals fight and suffer supply/terrain effects as armor, and cannot be trained or replaced after death.',
            'Fixed supply leaking through disconnected town fragments or adjacent hostile tiles. Both armies require a real friendly land route to a controlled town center, with the existing marine, ship, bridge and naval-supply rules retained.',
            'AI warships patrol coasts and hunt visible naval threats without requiring fog. Naval procurement checks whether harbors reach useful waters; stalled ferry missions replan. Wounded AI units seek medical sites, while hospital investments preserve recruitment funds.',
            'Narrow frontlines retain clearance between opposite sides of salients. Hospitals, generals and their effects support mobile controls, multiplayer and scenario round trips; Help and construction statistics include the new rules.'
        ]
    },
    {
        at:'2026-10-29T16:14:00-04:00',
        title:'Simpler shop era selection',
        items:[
            'Removed the extra Time period dropdown from the shop. The centered army style dropdowns change the era and preview names directly; selecting a modern style restores Modern. Your choice remains saved for the next battle.'
        ]
    },
    {
        at:'2026-10-29T14:27:00-04:00',
        title:'Match gold, falling treasure and clearer era previews',
        items:[
            'Win or lose, completed battles now award performance-based gold up to 50 per match. Active play time, enemy units destroyed, completed recruits and town captures contribute alongside the outcome; the results screen shows the breakdown. Pauses and faster game speed cannot inflate the time bonus, and saved reward receipts prevent duplicate payouts.',
            'Enlarged the shop wallet coin and balance. The credits coin now tumbles down onto successive headings, then disappears when its one-time treasure is claimed. Its landings persist and adapt to smaller screens and reduced-motion preferences.',
            'Selecting an era skin updates the preview unit names. Era choices now persist locally and through cloud sync instead of being reset to Modern by profile acknowledgements.',
            'Reset progress now opens a styled in-game confirmation with clear Keep progress and Reset progress actions, keyboard cancellation and restored focus.'
        ]
    },
    {
        at:'2026-10-29T14:02:00-04:00',
        title:'A little gold and a hidden treasure',
        items:[
            'New profiles begin with 100 gold. The shop wallet now uses a small minted gold coin, and existing saved balances are preserved.',
            'A curious little coin has appeared in the credits. Its discovery and reward are saved with your profile, including cloud saves.'
        ]
    },
    {
        at:'2026-10-29T13:38:00-04:00',
        title:'Full army shop previews and redesigned mobile controls',
        items:[
            'Your army and AI shop previews now show every recruitable class, including mounted/motorized infantry, skirmishers/mountaineers, transports and supply vessels. Names and symbols follow the chosen era and the two independently equipped skin packs.',
            'Mobile menus now fit the actual screen width instead of shrinking the whole interface. The shop has a compact wallet header, readable full-roster previews, touch-sized category tabs and a two-column skin catalog.',
            'Phone recruitment cards separate names, costs, mobilization times and building requirements. Unit orders, boarding, terrain effects and equipment are easier to read, and touch players can save selected troops as a numbered group.',
            'Campaign armies, recruitment, the map and region orders scroll naturally on small screens. Roster actions are larger, long specialist names wrap, and editor unit palettes support tap-to-place. Battle reports use compact summaries on short screens and retain scrolling details in portrait and landscape.'
        ]
    },
    {
        at:'2026-10-29T01:11:00-04:00',
        title:'Specialist equipment records and reliable crowded orders',
        items:[
            'Mounted and motorized infantry now report horses or trucks in service, plus equipment combat and attrition losses. A full regiment has 1,000 horses in earlier eras or 100 trucks in Modern; equipment strength follows the regiment’s health and recovery.',
            'Skirmishers, rangers, chasseurs and mountaineers have separate personnel and casualty records under their era names. Battle reports, end reports, unit cards and lifetime era filters include the new specialist and equipment statistics; multiplayer and cloud progress retain them.',
            'Crowded player units use a private sidestep route while keeping the issued destination, waypoint legs and visible arrow. Idle troops move aside and return without gaining a new player order. A fresh command immediately replaces the saved order, and blocked troops no longer abandon destinations several tiles away.'
        ]
    },
    {
        at:'2026-10-28T22:40:00-04:00',
        title:'Hidden commanders, purposeful crossings and smarter advances',
        items:[
            'AI personalities are now randomly assigned and hidden each match. Removed the setup selector and visible traits; commanders retain different recruitment, defense, flanking and attack preferences, with individual variation.',
            'Assaults account for enemies met on the approach and troops actually close enough to help. Remote reserves cannot justify a losing spearhead; groups regroup before losing their local advantage, assemble along the real target approach and reconsider understrength attacks toward weaker territory.',
            'Frontline sectors favor the actual army and threatened ground instead of arbitrary map edges. Forward bounds use terrain suited to each unit, including high ground for mountaineers and dry open approaches for motorized troops.',
            'AI bridges must connect landmasses or remove a substantial dry-land detour. Short walks around coasts and inlets, already convenient crossings and sites without nearby troops or useful destinations are rejected.',
            'Specialist names and symbols now match the era: Ancient cavalry/skirmishers, Medieval mounted men-at-arms/rangers, Napoleonic dragoons/chasseurs and Modern motorized infantry/mountaineers. Production, cards, campaign, Help and editor labels follow the era; unit capabilities and costs are unchanged.'
        ]
    },
    {
        at:'2026-10-28T17:27:00-04:00',
        title:'Motorized infantry, mountaineers and distinct AI commanders',
        items:[
            'Added motorized infantry: $3,000 / 2,400 MP, 23-second factory production, 180 HP and faster open-ground movement. Its firepower and toughness sit between infantry and armor; rough terrain slows and weakens it.',
            'Added mountaineers: $1,600 / 2,000 MP, 20-second town production and 85 HP. They are weaker than infantry on other terrain, stronger in hills and mountains, and can move through mountain cells. Both classes use normal supply/water attrition and can ride transports.',
            'Both units have distinct art across unit packs, production buttons, unit terrain effects, Help, campaign recruitment/reserves, editor/scenario support, battle/lifetime statistics and multiplayer data.',
            'Added Balanced, Deliberate offensive, Defensive, Maneuver, Amphibious and Highland commanders with visible traits in setup. Recruitment evaluates known enemies, terrain, garrisons, active logistics needs, pending units and upkeep instead of fixed ratios. Needed specialists remain available after early infantry recruitment; saved ship and vehicle budgets are not spent on fallback units or forts.',
            'Coordinated and local assaults compare actual troop health, morale, terrain and visible defenders. Timers no longer force weak attacks. Outmatched forces assemble, reinforce and regroup; mobile and flank groups capture territory independently of towns, while guards, terrain positions and relief groups protect the front.',
            'Empty fully enclosed inland regions now transfer entirely, including peaks and undefended town cells. Living units, any water contact, neutral gaps and map edges prevent automatic surrender.'
        ]
    },
    {
        at: '2026-10-27T22:21:00-04:00',
        title: 'Reliable crossings, trade routes and unit details',
        items: [
            'Bridge construction requires at least one bank in the builder’s own territory for every faction. The other bank may be hostile. Losing both banks before completion cancels and refunds the job. Bridge routes now use actual clear approaches to each bank, preventing shortcuts through nearby mountains or open water.',
            'Friendly columns yield around intersecting paths and resume their saved destinations after traffic clears. Temporary blockers no longer count as arrival. Idle units clear expired retreat states and return fire normally; active retreats and morale routs retain their rules.',
            'Your unit’s manpower, morale and active terrain/combat effects appear directly below its order buttons on desktop and mobile. Effect tooltips preserve their hovered anchor through live countdown updates and scrolling, including on the terrain page.',
            'Trade caravans and merchant boats retain their real destination town and arrival marker, follow complete routes, pay once on delivery and reroute when a destination is captured. Boats use reachable harbor waters instead of chasing inland town centers, never turn into swimming infantry, and avoid disconnected lakes.',
            'AI troops held on a townless island request reachable naval supply or a ferry back to friendly city supply. Town guards stay on their own landmass. Secured islands retain support until resupplied or evacuated; supply ships cancel traffic sidesteps that become unsafe after a new landing.'
        ]
    },
    {
        at: '2026-10-27T00:57:00-04:00',
        title: 'Active naval invasions and accurate transport landings',
        items: [
            'Transport land orders now choose the clicked coast on the requested landmass. Selected loaded transports reserve separate nearby landing cells and water approaches. Validated sea routes are reused, and naval routing prefers complete shortest water paths over greedy coastal detours.',
            'AI fleets scout unexplored seas, discover hostile islands through normal fog knowledge, ferry infantry and armor in repeated waves, and escort their landing force. Reinforcements rally at existing beachheads instead of scattering along unsupported shores.',
            'AI passengers wait safely aboard until their landing is supplied. Landed troops clear the docks, retain their invasion assignment, take coastal territory and town cells, and advance with their supply ships. Support vessels preserve coverage of the landing group; traffic yielding cannot pull them away or send landed troops back to an obsolete rally point.',
            'Naval orders reserve clear destinations so supply ships, escorts and transports do not crowd the same water tile. Town-sweeping orders respect ferry missions and temporary traffic yielding. Passenger shore approaches use the same terrain-aware straightened routes as ordinary movement.'
        ]
    },
    {
        at: '2026-10-26T23:27:00-04:00',
        title: 'Bridge supply, naval retreats and archipelago logistics',
        items: [
            'Completed bridge decks now carry supply and permit safe recovery. Bridge geometry now retains its deck cells on the live bridge, restoring diagonal shore connections and cached route links. Friendly islands without towns receive supply across a completed bridge to a connected friendly town. Supply updates when a bank changes hands or a bridge is removed; unfinished work and open water do not carry ordinary land supply.',
            'Coastal territory no longer surrenders automatically on island landings, including undefended islands and the remainder of islands with captured towns. Troops still capture their normal local area; fully enclosed inland remnants retain their capture rules.',
            'Transport and supply-ship retreat buttons now search reachable open water rather than owned land. Naval retreats preserve passengers, follow legal sea routes and work through authoritative multiplayer commands.',
            'Short waypoint snaps now validate terrain and unit clearance. Friendly formations use consistent avoidance and temporary yielding at crowded passages, preserve queued destinations and return idle blockers after traffic passes. Ships recover old invalid land positions before planning routes and stay on open water.',
            'Archipelago AI reacts to known water-separated objectives, can invest in harbors and fleets before reaching ten land units when town guards and an assault force are ready, and balances transport, supply-ship, escort, marine, bridge and infantry needs. Fog knowledge, siege gates and recruitment reserves still apply.'
        ]
    },
    {
        at: '2026-10-26T15:40:00-04:00',
        title: 'Smoother background work and accurate build notices',
        items: [
            'Removed repeated island connectivity floods from naval planning. Physical coast and land-component caches refresh after terrain/bridge changes; ownership and fog knowledge remain current.',
            'Pathfinding shares a bounded CPU allowance across each rendered frame instead of multiplying work at faster speeds. AI movement requests coalesce per unit and apply across frames. Trade convoy route attempts run across frames without repeating city pairs and reuse validated paths. Bridge candidates receive cheap strategic ranking before footprint validation advances in short slices; validation no longer repeats for every candidate in one long economy pulse. Finishing a bridge preserves valid army routes and refreshes waiting units gradually. City-name drawing uses bounded cached sprites.',
            'Unfunded fort orders now report the required money and your balance. Fort placement shares one precise reason, and pending forts/bridges give duplicate-construction warnings. Town build messages distinguish unavailable resources, prerequisites, busy queues, existing structures and sieges.',
            'Queued town construction no longer claims the building is finished. Informational queue notices and green completion notices replace misleading red success messages. Notifications stay readable on phones and replace overlapping messages.',
            'Help now has a dedicated Supply and the 10-second attrition timer section, explaining game-time counting, pause and faster speeds, resupply/boarding resets, healing restrictions and the same rules for player and AI.'
        ]
    },
    {
        at: '2026-10-26T14:25:00-04:00',
        title: 'Ocean invasions, steady camera panning and attrition reports',
        items: [
            'AI ferry assaults now reach distant islands and known hostile coasts without towns. Open-ocean routes go around islands and ignore disconnected inland lakes; completed bridges remove the need for a ferry.',
            'Transports choose separate clear landing spots, retry blocked landings and return for another wave. Landed troops commit to the beachhead while supply ships support troops ashore and keep unloading lanes clear. Infantry town guards remain at home.',
            'WASD and edge panning use real frame time, keeping camera movement identical at pause, 1x, 2x and 3x, including multiplayer clients.',
            'Every unit receives ten uninterrupted simulation seconds out of supply before supply attrition starts. Regaining supply or boarding a transport resets the countdown. Land and water share the same timer; ships and marines retain their water exemption. Unsupplied units cannot heal during the grace period. Unit effects and overhead warnings show the countdown.',
            'Battle and completed-match reports now separate attrition personnel, armor, whole units, vessels and HP damage from combat losses, with land-supply, water and unpaid-upkeep damage breakdowns. Unit service records show attrition losses, and multiplayer synchronizes the timers and totals.'
        ]
    },
    {
        at: '2026-10-26T12:45:00-04:00',
        title: 'Supply ships, reliable bridges and complete waypoint routes',
        items: [
            'Construction completed totals moved to Economy. Editor delete controls remain hidden until a unit is selected; placing a unit no longer automatically selects it.',
            'Waypoint arrows retain every queued leg and their first turn after caching. Multi-stop orders visit their stops instead of smoothing across them. Frontline refreshes respond faster while retaining incremental rendering.',
            'Unit terrain pages now show that unit’s attack, damage taken, movement, accessibility, water and supply rules for every terrain, plus its current effects. Enemy effect tooltips clear on pointer exit, selection changes, card updates, scrolling and window changes.',
            'Bridge construction now survives neutral water at its center. A translucent bridge ghost and countdown remain visible until the full 60-second build completes; paid work waits if completion is temporarily blocked.',
            'Added supply ships: $2,400 and 1,000 MP, harbor required, 22-second mobilization, 50 HP and transport-level firepower. Their supply radius matches a fort. Nearby friendly marines and troops ashore count as supplied; ordinary land units swimming without transports remain unsupplied and take water attrition. Supply does not allow land units or marines to heal afloat.',
            'AI ferry planning identifies water-separated known objectives, reserves infantry town guards, transports invasion infantry and armor, and moves supply ships beside landing areas. Naval recruitment budgets for transports and supply vessels. Supply ships have matching era/pack art, range indicators, campaign recruitment, editor support, multiplayer/save serialization and lifetime production totals.'
        ]
    },
    {
        at: '2026-10-26T05:40:00-04:00',
        title: 'Working waypoints, fair sieges and individually authored battlefields',
        items: [
            'Shift + left-click now appends movement waypoints, alongside Shift + right-click. Move, Waypoint and Formation buttons accept mouse clicks as well as touch. Shift-clicking friendly troops still adds them to the selection, and releasing a drag outside the map clears the gesture.',
            'AI faction reports now use the same full-width cards as the player. Board and Unload share the existing unit order bar, with matching icons and visible transport capacity. Group controls stay clear of the unit card and bottom menus.',
            'Player and AI towns share siege checks for every unit and town structure. Enemy troops in weapon range of urban cells block new orders and pause existing construction and mobilization until the attack clears.',
            'Replaced the seventeen campaign-stage templates with individual north-up maps: different river courses, tributaries, canals, lakes, coastlines, ridges, marshes, street districts, parks, crossings and road approaches. Removed artificial offshore depot islands from the beach stages. Refined standalone maps including inland Hastings, the Goldbach, Seim crossings and Midway’s islands.',
            'Rounded previews show the authored geography, with larger briefing previews, named landmarks and battlefield notes. Curved roads and geographic metadata survive editor and multiplayer map serialization. Ferry unloading favors short crossings to a shore connected by land to the destination.'
        ]
    },
    {
        at: '2026-10-26T04:15:00-04:00',
        title: 'Historical campaign packs and ancient emblem previews',
        items: [
            'Fixed ancient civilization shop previews caching blank counters before their SVG emblems loaded. All eleven emblem variants now use bundled art, repaint when ready and refresh cached unit sprites.',
            'Added seventeen connected missions in three gold campaign packs: Berlin 1945 (seven stages, 350g), Normandy: D-Day to Cherbourg (five stages, 300g), and Market Garden: Bridges and Withdrawal (five stages, 300g). Win stages in order, save progress, replay unlocked stages and open the next briefing from the victory report. Losses and surrenders allow retries.',
            'Added complete-sector capture, timed defense, naval and evacuation objectives with live objective progress. Market Garden ends with an Oosterbeek ferry evacuation; tactical success is distinguished from the historical operation’s unsuccessful outcome.',
            'Refined the seven existing missions with corrected dates, historical context, source links and bounded objectives. Thermopylae and Kursk are defensive stands, Midway uses a naval objective, and the Normandy beachhead mission no longer requires later captures such as Caen on D-Day. Existing purchases and completion records remain valid.',
            'Authored distinct terrain, waterways, crossings and town sectors in code. Historical starts retain authored positions and halve each unit class, preserving landing waves and evacuation ferries. Campaign previews show stage locks and pack progress with improved desktop/mobile scrolling. Fixed mission timers scaling twice at accelerated speeds and preserved custom objectives through editor import/export.'
        ]
    },
    {
        at: '2026-10-26T03:17:00-04:00',
        title: 'Clean coastlines, local island capture and a clearer battle report',
        items: [
            'Removed the thin square outlines around rounded classic coast cells by aligning their corner cutouts with the actual painted pixel boundaries. Rounded land, water and territory masks now meet cleanly.',
            'Landing on a townless island captures the normal area around each unit. Both pocket surrender and small-remnant cleanup preserve the remaining coastal territory instead of transferring the whole island. Genuine enclosed inland pockets still clear normally. Ordinary infantry and armor still require city supply; marines retain their coastal supply exception. Applies equally to player and AI.',
            'Rebuilt the battle report with your faction summary above the tabs, Players first by default and the local player first in every faction comparison, including multiplayer guests. Faction details now have labeled territory, army, economy and combat sections with readable rows. Economy, Forces and Combat have clear headings and grouped metric cards.',
            'Fixed an old desktop style that forced all four report sections visible at once. Tabs now show exactly one section, reset its scroll position and support keyboard navigation. The summary and section buttons stay visible while details scroll. Improved text contrast, tablet columns and narrow-phone value sizing, and retained hidden enemy information under fog and full completed-match reports.'
        ]
    },
    {
        at: '2026-10-26T01:55:00-04:00',
        title: 'Smooth aerial terrain, rounded fog and independent HD cosmetics',
        items: [
            'Atlas HD terrain and Atlas HD Units are now separate 100-gold shop purchases. Equip realistic, era-aware infantry, armor and naval art with either map style, or keep your favorite counters on aerial terrain. Both cosmetics are included in the Supporter Pack, and ownership and equipment persist locally and in cloud profiles.',
            'Transports now match every unit pack: NATO and Napoleonic cargo-vessel counters, ancient and medieval counters, civilization emblems, countryball flags, WW2 chips and Sovereign chips. Cargo markings distinguish transports from warships. Atlas HD Units retain detailed transport vessels appropriate to the battle era.',
            'Rebuilt aerial terrain from connected, smoothly rounded coastlines and biome outlines. World-anchored textures and continuous coastal shallows replace per-cell blend rectangles and corner patches, eliminating the white pinholes and sharp inter-cell seams. Softened rock relief and curved mountain ridges. Rounded coast water remains neutral and narrow land crossings remain intact.',
            'Fog uses connected outlines with the same bounded smoothing as frontlines instead of stacked cell squares and circles. Tiny enclosed sight gaps are resolved consistently for all factions, while larger undiscovered regions and exploration memory remain covered. Scouting and hidden enemy information continue to use independent faction vision.'
        ]
    },
    {
        at: '2026-10-25T23:25:00-04:00',
        title: 'Detailed battle reports, fair scouting and improved aerial terrain',
        items: [
            'Redesigned the live battle report with responsive Economy, Forces, Combat and Players tabs, readable faction cards and land-control bars. Every faction has a land-tile count and percentage; water is excluded. Added composition, readiness, supply, embarked passengers, production queues, siege, infrastructure, treasury, income, spending, recruitment manpower, damage, recovery, unit losses, town captures and land gained/lost. Finished-match reports show detailed faction comparisons, and match counters travel with multiplayer snapshots.',
            'Fog now updates during marching and camera movement. All units reveal circular sight around their actual positions: infantry and marines five tiles, armor four, warships six, transports five and convoys three. Friendly territory sees two tiles beyond its edge; towns and forts also provide sight. Exploration persists after troops leave, with rounded fog edges and clear visible cells.',
            'AI factions use independent fog knowledge for threat scans, combat targeting, naval prey, coastal assaults, strategic objectives, enemy strength estimates and fort planning. Hidden units and undiscovered towns are not targets. Discovered towns retain last-seen information instead of revealing hidden changes. Infantry scouts explore unknown frontiers while town guards remain assigned; marine and ship patrols scout seas, and coastal recruitment can fund exploration before an enemy port is found. Allied factions share sight.',
            'Live enemy reports under fog show only spotted forces and hide treasury, production and losses; public land totals remain available. Full faction details become available after the match. Added scouting and report rules to Help.',
            'Atlas HD now uses higher-resolution, densely branched mountain ranges, directional rock lighting, erosion grain and peak highlights. Rounded biome junctions and radial terrain blending reduce square patches while preserving the shared circular cell footprints, neutral coast water and narrow passages. All terrain art remains procedural code.'
        ]
    },
    {
        at: '2026-10-25T22:34:00-04:00',
        title: 'Naval combat, troop transports and complete town assaults',
        items: [
            'Fixed marines being immune to all damage afloat. Marines still avoid water attrition, but enemy fire now damages them normally. Ground troops and naval units exchange fire across shores and on water, with consistent defender terrain modifiers and targeting at maximum range. Warships now have 300 HP, matching armor toughness; legacy default warships preserve their health percentage when upgraded.',
            'Added the transport: a fragile 50-HP ship with half infantry firepower, 500 crew and space for exactly one land unit. Costs $2,000 / 1,000 MP, needs a harbor and mobilizes in 18 seconds. Board by right-clicking a friendly transport or using Board transport. Right-click land with a loaded vessel or use Unload; occupied shores wait until clear. Transports can also rescue land troops already afloat. Passengers retain health, experience, identity, upkeep and campaign roster membership, remain safe from attrition aboard, and are lost if their transport sinks.',
            'Transports have code-drawn art for modern, Napoleonic, medieval and ancient eras, plus map/editor/help/production/campaign controls, cargo indicators, mobile boarding/unloading buttons, multiplayer commands and cargo snapshots. Transport production statistics also persist in cloud profiles.',
            'Marines show the blue embarkment icon in water. Healing icons now require an actual recovery tick and missing strength, and disappear at full health/manpower or when no manpower is available.',
            'All armies use immediate body separation, including exact spawn stacks. Removed narrow-lane ghosting and delayed separation. Training waits for a free spawn slot, and temporary avoidance waypoints no longer trap friendly AI marchers. Player and host movement formations allow room for unit bodies.',
            'Explicit water orders keep their requested sea destination, favor useful land approaches, and retain shoreline waypoints when smoothing. Ordinary AI infantry/armor wait for bridges or ferry access instead of swimming into attrition; coastal recruitment favors marines and escorts, and transports handle stranded assault requests without repeatedly reboarding landed troops.',
            'AI units revisit remaining hostile urban cells during town assaults instead of stopping at the center. Capturing every town cell remains required. Multiplayer validates transport ownership/capacity and runs boarding/unloading on the host.'
        ]
    },
    {
        at: '2026-10-25T14:54:00-04:00',
        title: 'Rounded Atlas HD terrain, reliable pockets and neutral water',
        items: [
            'Added the free Atlas HD skin in Shop → Map skins: procedural aerial terrain, shaded rock relief, forest canopies, fields, coastal shallows, settlement roofs and era-aware infantry, armor, cavalry, cannon, ships and supply wagons. All art is drawn in code, following the same rounded cell shapes as the default skin.',
            'Terrain now covers every cell and the space between cell centers. Removed oversized overlapping discs and fake diagonal land bridges. Generated checkerboard coast corners are resolved in the terrain data before faction balancing; invalid repairs regenerate. Tiny real land borders remain visible, and political overlays use the same complete, rounded land footprint.',
            'Empty encircled mountain ranges now transfer to their surrounding enemy just like other land. Mountains remain impassable; occupied pockets, supplied towns and separate unoccupied islands retain their existing rules.',
            'Oceans, rivers and lakes stay neutral: water is not captured, counted as territory or land income, or outlined as a political border. Scenario imports, editor painting and multiplayer terrain normalize old water claims. Naval patrols target hostile shores instead of owned sea tiles.',
            'Ordinary troops receive five full uninterrupted simulation seconds in open water before 3.5% maximum HP/s attrition begins. Dry land and completed bridges reset the timer; pausing does not advance it. Ships and marines alone avoid water attrition. Only ships can heal afloat; marines cannot. These rules apply equally to players and AI, and the unit tooltip shows the grace countdown.',
            'Removed surrender confirmations. Surrender immediately opens the battle result or leaves multiplayer, while preserving lifetime statistics. Surrendering a campaign save clears it directly.'
        ]
    },
    {
        at: '2026-10-25T11:06:00-04:00',
        title: 'Consistent capture and new historical missions',
        items: [
            'Cities and territory layers are off by default again in new solo/multiplayer matches and the map editor. Both remain available from the layer controls.',
            'Removed the extra capture ring on uncontested ground. Players and AI use the same fixed footprint per unit type, with occupied/defended cells still protected.',
            'Added four 150g shop missions: Thermopylae, Hastings, Austerlitz and El Alamein, with authored terrain, battle briefings and reinforcement events. Each uses era-appropriate visuals and audio without requiring a separate skin purchase.',
            'Improved D-Day, Kursk and Midway: fewer crowded Normandy objectives, spaced batteries, a connected English staging coast, separated town footprints, larger playable atoll islands and supplied dry-land starts for ordinary formations. Existing purchases and completion records keep their IDs.',
            'Shop mission cards now include larger previews, dates, eras, difficulty and objectives. Naval previews include fleets, and preview grid scale follows the authored map. Historical reference notes are included with the scenarios.'
        ]
    },
    {
        at: '2026-10-24T17:50:00-04:00',
        title: 'Reliable lifetime stats and playtester layout',
        items: [
            'Lifetime stats record completed matches, wins, losses and surrenders. Domination, annihilation, scenario/campaign results and mid-match exits save immediately; duplicate result callbacks cannot count a match twice.',
            'Combat updates no longer postpone saves indefinitely. Match endings, menu exits and browser close events flush progress. Stats follow the actual battle era, and era filters include authored scenario periods.',
            'Multiplayer snapshots carry typed combat and production totals for each faction. Every player receives their own stats, with delta tracking preserved across reconnects. Opening armies and the menu battle do not count as trained units or combat progress.',
            'Chris Meehan and Bailey Carpenter now appear on separate lines in Credits.'
        ]
    },
    {
        at: '2026-10-24T17:14:00-04:00',
        title: 'Cleaner island borders and playtester credits',
        items: [
            'Townless offshore islands keep a single owner. Exact land balancing adjusts the mainland instead of carving small islands into coastal fragments, while keeping equal land totals and supplied starting armies.',
            'Generated starts reject tiny coastal claims, split small islands, enclosed lake/frontline loops, folded borders and local hairpins. Validation checks the same visible border graph used by previews and gameplay; malformed candidates regenerate before appearing.',
            'Added playtesters Chris Meehan and Bailey Carpenter beneath the developer in Credits, with thanks for their design suggestions, bug discoveries and feedback.'
        ]
    },
    {
        at: '2026-10-24T17:00:00-04:00',
        title: 'Scenario editor fixes and faster movement',
        items: [
            'Map and mission imports, exports and saved-library maps preserve the era, grid scale, units, roads, bridges, forts, alliances, starting resources and scripted events. Scenarios without events retain their title and victory conditions; zero-second events work correctly.',
            'Loading a scenario refreshes editor controls without overwriting imported events. Invalid files leave the current map intact, and saved snapshots remain independent of later edits. Authored eras and starting resources carry into play.',
            'Selected editor units show a small delete button beside them. Deletion supports undo, redo, Delete and Backspace; typing in fields does not delete units.',
            'All unit types move 20% faster. Cities and territory layers are enabled by default for new matches and in the map editor.'
        ]
    },
    {
        at: '2026-10-24T14:05:00-04:00',
        title: 'Equal siege rules, water attrition and separated towns',
        items: [
            'Player and AI towns use the same production lock. Combat, hostile occupation or contested urban cells block recruiting and pause paid construction/reinforcement queues; progress resumes when the threat clears.',
            'Every unit in open water except ships and marines is out of supply, loses 3.5% maximum HP per second and cannot heal. Orders, nearby friendly towns and forts do not exempt water crossings. Completed bridge decks count as land, and water damage is applied only once.',
            'Land armies prefer dry detours and completed bridges. Nearby water no longer counts as permission to enter it; automatic shortcuts require a much larger distance saving with water exposure factored in. Shore entry and exit waypoints survive smoothing, and shared incremental land connectivity avoids repeated timed-out searches.',
            'AI bridge searches include troops waiting at internal rivers, support one-cell rivers, prioritize nearby army crossings and preserve recruitment funds. Construction still takes 60 seconds, with caps and a guard against duplicate pending bridges.',
            'Generated town centers remain at least eight cells apart, with no touching urban footprints. Removed the close-town fallback; constrained layouts regenerate instead. Campaign, skirmish and multiplayer share the rule.'
        ]
    },
    {
        at: '2026-10-24T13:40:00-04:00',
        title: 'Reject malformed starting maps and regenerate',
        items: [
            'Generated maps must pass a final border-quality check before previews or armies appear. Disconnected mainland claims, enclosed ownership pockets, long one-cell tendrils, excessive frontier winding and unsupplied inhabited land are rejected.',
            'Removed the retry-limit fallback that could accept malformed starts. Generation continues with fresh deterministic seeds until both border quality and equal land/town checks pass, while yielding to keep the loading UI responsive. Campaign, skirmish and multiplayer generation share the checks.',
            'Corrected terrain-density limits for rectangle, mountain, forest, desert and archipelago maps so healthy terrain reaches validation promptly. Genuine separate islands remain supported; neutral-territory editor generation keeps its normal workflow.'
        ]
    },
    {
        at: '2026-10-24T13:17:00-04:00',
        title: 'Clean coastal previews and no stray mountain pockets',
        items: [
            'Frontlines stop at the open-ocean shoreline in setup previews, lobbies and gameplay. Offshore ownership hooks, loops and isolated sea lines are no longer drawn; enclosed lakes and real land pockets retain their borders.',
            'Starting land cleanup includes political mountain connectivity. Mountains on inhabited landmasses are no longer treated as empty offshore holdings, and balancing preserves both political continuity and walkable town supply using cardinal neighbors.',
            'Unsupported mountain remnants are repaired before exact area balancing. Fully protected frontiers reject invalid transfers instead of creating inland ownership islands. Factions keep equal land totals and supplied opening armies.'
        ]
    },
    {
        at: '2026-10-24T12:35:00-04:00',
        title: 'Even map regions, cleaner movement and complete town assaults',
        items: [
            'Starting territories use gently warped distance fields and solve area quotas directly, preventing terrain-driven ownership rings and winding splits. Every faction gets equal land and town totals within the generated match, with supplied opening armies and safe rear deployment. Constrained seeds retry deterministically, and town footprints use their own seeded random stream.',
            'Primary towns are planned on the shared landmass before final balancing. Procedural layouts retry instead of moving capitals through other regions and carving long colony corridors. The same input seed reproduces terrain, ownership, towns and deployment.',
            'Narrow mountain passes connect starting land inside each faction before supply repair, preserving compact borders instead of redrawing territory around mountain ridges.',
            'Friendly units steer around crowds and can move apart after overlapping. Clear terrain routes are pulled straight while retaining necessary terrain corners and bridge deck waypoints; hostile units and impassable terrain remain blocking.',
            "Player and enemy armies use the same encirclement warnings and attrition. Hostile ground cannot give a unit the hostile town's supply, and heavy marching loads no longer starve supply scans. Friendly town supply and the marine-only water exception are preserved.",
            'Infantry, armor, flank groups and landed marines spread town assaults across remaining hostile urban cells. Groups retarget as cells fall, capture every town cell before the town changes hands, and keep normal town garrisons.'
        ]
    },
    {
        at: '2026-10-23T22:15:00-04:00',
        title: 'Smooth borders, coastal ownership and standing town guards',
        items: [
            'Frontlines now smooth across several tile edges while keeping real junctions and bounded curves. The exact boundary graph remains intact, without stitching unrelated ends together.',
            'Empty coastal cutoffs transfer across shoreline and mountain remnants. Lakes, rivers and seas inherit political ownership from their nearest current land banks, removing stale enemy-water rings as armies advance. Water keeps its naval terrain and marine-only supply behavior.',
            'The menu battlefield and terrain buffers stay cached during matches. While final stats are open, the menu world is prepared incrementally for a quick return without regenerating or copying its terrain. Final battle statistics remain unchanged.',
            'AI reserves one infantry for each town before forming assault groups, refills lost garrisons, recruits for vacant towns before investing in buildings, and commits slightly more remaining infantry to the front defense. Town guards hold their town centers and are protected from routine relief assignments.',
            'AI infantry start in their towns, and columns no longer stop early at narrow pass exits when nearby friendlies trigger group-arrival rules.'
        ]
    },
    {
        at: '2026-10-23T21:45:00-04:00',
        title: 'Visible groups, narrow passes and clean frontlines',
        items: [
            'Group controls stay above the production UI when structures or units are expanded. Their position follows dock animation, resizing and the scaled mobile viewport.',
            'Movement keeps terrain-critical turns and recenters units nudged against pass walls. Friendly regiments file closer through one-cell passages and advance shared corner waypoints when the next segment is clear; hostile units and solid terrain remain blocking.',
            'Empty one- and two-cell enemy remnants are absorbed when fully surrounded by one hostile faction, including inaccessible mountain cells. Towns, troops, forts, construction sites, larger pockets and allied territory are protected. Cleanup runs only during live authoritative gameplay.',
            'Frontlines now trace the exact shared edges of territory. Nearby unrelated ends are never stitched together, junctions meet at real corners, and bounded corner rounding closes loops without spurs, crossings or teardrop glitches. Setup and lobby previews share the same border geometry.'
        ]
    },
    {
        at: '2026-10-23T17:01:00-04:00',
        title: 'Captured towns supply surrounded armies',
        items: [
            'Every friendly town, including a captured enemy town or allied town, supplies its connected land pocket even when surrounded. Current town ownership and land routes override stale encirclement flags immediately, restoring safe recovery and removing supply-based town production blocks.',
            'Only pockets without a cardinal land route to a friendly town lose land supply. Map edges and neutral borders no longer exempt townless pockets. Marines retain their ocean/river supply exception; infantry and armor still require a town connection.',
            'Supply checks share a cached land-component search, update when territory, towns or alliances change, and use the same friendly-town rule for AI supply planning. Updated the rules with the captured-town case.'
        ]
    },
    {
        at: '2026-10-23T10:15:00-04:00',
        title: 'Empty towns at every match start',
        items: [
            'Campaign, skirmish and multiplayer now enforce empty towns at the final launch boundary. Factories, harbors and farms are removed from every starting town, including player, AI, neutral, preview and custom-map towns.',
            'Multiplayer hosts clear starting town buildings before sending the map, and guests enforce the same rule when loading it. Rejoining an ongoing match preserves buildings already constructed during play.'
        ]
    },
    {
        at: '2026-10-23T05:20:00-04:00',
        title: 'Supply corridor defense and protected forts',
        items: [
            'AI assesses supply across its whole territory, including large encirclements. It protects threatened narrow corridors and coordinates trapped formations with outside relief troops at opposite ends of a shared breach.',
            'Territory incursions now draw a limited response force even far from towns. Emergency assignments interrupt stale orders, preserve fort garrisons, and release troops back to their existing missions when the threat clears.',
            'Defenders use the actual combat terrain bonuses: infantry seek forest, hills and urban cover, while armor avoids unfavorable rough ground. Defensive positions must connect over friendly walking routes.',
            'AI forts require nearby land troops, space from other forts, and at least two clear tiles behind hostile territory. Exposed or enemy-contested construction sites are rejected. Both construction sites and completed forts receive standing guards.'
        ]
    },
    {
        at: '2026-10-23T04:45:00-04:00',
        title: 'Committed assaults, coastal raids and movement audio',
        items: [
            'AI armor now assembles with nearby infantry and commits to reachable town assaults. Reinforcements join existing pushes; routine planning no longer sends an active assault back to its staging area.',
            'AI armies devote more troops to offense while retaining town guards and front-line defenders. Weak towns receive concentrated attacks, and captured towns become stepping stones to the next objective.',
            'Marine squads coordinate with ships: assemble at a friendly coast, cross to a shared beach, land near a vulnerable enemy town, and keep naval support offshore. Coastal armies can build an escort fleet even before the player has ships.',
            'Game SFX defaults to 100%, with saved preferences preserved. Added twenty mastered ElevenLabs v3 move-order cues for all eras and unit types, with alternating infantry variations and one cue per group order. A brief music dip keeps commands clear.',
            'Music credits now come from the playback catalog: all 25 shipped recordings have recording credits, original-source links, license links and change notices. Removed absent songs from the offline license list and corrected recording attributions.'
        ]
    },
    {
        at: '2026-10-23T03:36:00-04:00',
        title: 'Fair borders and supplied starting armies',
        items: [
            'Starting land units now deploy only on walkable friendly ground connected to an owned town. Empty offshore islands no longer receive stranded starting troops.',
            'The final territory split repairs isolated mainland pockets and preserves narrow town supply corridors while balancing each faction\'s land area. Sea painting no longer changes the balanced mountain holdings.',
            'Unoccupied offshore claims and impassable mountain pockets no longer surrender automatically at launch. Occupied islands keep the normal capture and encirclement rules.',
            'When isolated small islands prevent an equal split, starting town placement is adjusted onto shared walkable land while keeping faction town counts equal.',
            'Front troops stay evenly spaced along supplied borders, with about 20% at the front and 80% near towns. Armor continues to start behind the border.'
        ]
    },
    {
        at: '2026-10-23T02:50:00-04:00',
        title: 'Individual combat audio and production balance',
        items: [
            'Every engaged unit pair now has its own positioned combat channel, independent playback phase and era-specific sound. Reciprocal fire shares one channel; separate fights keep playing independently.',
            'Combat remains audible at every supported zoom. Multiple fights share a controlled overall mix so large battles do not become deafening.',
            'Infantry mobilize in 15 seconds, marines in 20, heavy units in 25 and ships in 30. All buildings, forts and bridges take 60 seconds.',
            'Doubled money and manpower purchase requirements. Structure prices and campaign recruitment, research and field-repair costs are doubled; already purchased campaign reinforcements still call in without a second charge.'
        ]
    },
    {
        at: '2026-10-23T02:10:00-04:00',
        title: 'Unit acknowledgements and strict era audio',
        items: [
            'Added twenty short unit-selection cues across all four eras, distinguishing infantry, marines, heavy units and ships, with alternating infantry variations.',
            'Click, touch selection, drag selection and control-group recall share one restrained acknowledgement per action. Paused selection works; rapid clicks do not pile up sounds.',
            'Ancient and medieval combat beds were regenerated with explicit pre-gunpowder restrictions. Selection cues use bronze/wood, horses, oars and rigging where appropriate; mechanical armor cues belong to the modern era.',
            'Switching eras now stops the previous bank immediately, including lingering effects and delayed loads. Unknown eras stay silent instead of falling back to modern combat.'
        ]
    },
    {
        at: '2026-10-23T01:43:00-04:00',
        title: 'Distant combat sound design and stronger defense',
        items: [
            'Replaced every battle and building effect with a new mastered ElevenLabs Sound Effects v3 bank: two long combat variations, work, mobilization and completion sounds per era.',
            'Combat remains faintly audible at overview zoom. Smooth crossfades, distance filtering, controlled peaks and a gentle temporary music dip keep the mix clear without drowning out the soundtrack.',
            'Building work and completion now have distinct grounded cues, with limits on simultaneous sounds.',
            'AI allocates slightly more infantry to town and frontline defense, while attack and flank groups seek less-defended routes and avoid covered fort approaches.'
        ]
    },
    {
        at: '2026-10-23T00:30:00-04:00',
        title: 'Economy, mobilization and purposeful AI',
        items: [
            'Doubled town, building and land income; command funding keeps small-map starts profitable. Manpower growth now supports repeated recruitment.',
            'Units mobilize in 30 seconds; all buildings take 60 seconds, with small countdown clocks beside production sites.',
            'AI recruits first below ten field units, spaces forts apart, and invests in factories, farms and naval access when needed. Supporting groups protect attack corridors.',
            'Only marines receive ocean/river supply in cut-off coastal pockets. Infantry and armor still take encirclement damage there.',
            'Infantry naming and group cards are clearer. Quiet nearby combat, mobilization and construction sounds match all four eras, with independent saved volume and mute controls.'
        ]
    },
    {
        at: '2026-10-22T23:15:00-04:00',
        title: 'Even frontline deployment',
        items: ['Starting frontline troops now spread evenly along the full land border, including bends and separate fronts. The 80/20 split and rear-only armor are unchanged.']
    },
    {
        at: '2026-10-22T22:30:00-04:00',
        title: 'Deployment, construction and command groups',
        items: [
            'Opening armies are 50% smaller. About 20% deploy near the front and 80% around towns; armor always starts in the rear.',
            'All towns start without buildings. Forts, factories, farms and bridges take 30 seconds; infantry train in 10s, marines in 15s, armor in 20s and ships in 25s. AI follows the same rules.',
            'Ctrl + 0–9 saves a unit group; press its number or click its HUD button to select it.',
            'AI fields separate town/fort guards, frontline defenders, attack groups, flanking groups, armor spearheads, marines and naval groups.',
            'Campaigns deploy half your roster. Call remaining reserves as timed reinforcements with the unit buttons; units keep their names, wounds and experience.',
            'Drag campaign troops to choose deployment order. Dismiss directly with a 50% refund; Undo restores accidental dismissals.',
            'Fast editor brush strokes interpolate between pointer samples for continuous paint.'
        ]
    },
    {
        at: '2026-10-22T03:05:00-04:00',
        title: 'Menu and armies',
        items: [
            'Back no longer rebuilds the menu map.',
            'Divisions are numbered by era, with a separate count for each faction. Numbers only go up. A destroyed division leaves the roster.',
            'Rates say whether they are $ or manpower.',
            'The changelog opens over the main menu. Music starts when you close it.'
        ]
    },
    {
        at: '2026-10-22T01:55:00-04:00',
        title: 'Map editor',
        items: [
            'Placing a town, factory, harbor, or urban tiles no longer stalls the editor.',
            'Place unit is a click. Pick infantry, marines, armor, or a ship beside the button. Holding does not paint units.',
            'Dropping a unit on the map shows up immediately.',
            'View layers switch without rebuilding the map.'
        ]
    },
    {
        at: '2026-10-22T00:16:00-04:00',
        title: 'Map editor',
        items: [
            'Painting terrain and territory updates under the brush immediately, instead of redrawing the whole map.',
            'A terrain stroke no longer leaves specks of water in the paint.'
        ]
    },
    {
        at: '2026-10-21T11:45:00-04:00',
        title: 'Achievements',
        items: [
            'Each achievement on the Progress screen now shows its picture, gray until you earn it.',
            'On Steam, earning an achievement also unlocks it on your Steam profile.'
        ]
    },
    {
        at: '2026-10-21T03:02:45-04:00',
        title: 'Menu',
        items: [
            'The changelog stays open beside the main menu.',
            'Quit, at the bottom of the main menu, closes the game.',
            'The Steam version launches in fullscreen.'
        ]
    },
    {
        at: '2026-10-20T23:50:31-04:00',
        title: 'The computer fights back',
        items: [
            'AI attacks along one front, hooks around your line, and tries to close a pocket.',
            'It garrisons a city or fort when troops are actually threatening it, and pulls damaged units back.'
        ]
    },
    {
        at: '2026-10-20T21:56:51-04:00',
        title: 'Main menu',
        items: [
            'The main menu opens without waiting for the whole soundtrack.'
        ]
    },
    {
        at: '2026-08-21T01:35:10-04:00',
        title: 'Skirmish maps',
        items: [
            'Starting a skirmish builds the match map, instead of dropping you onto the setup preview.',
            'Changing how many opponents you face refreshes that preview, and Start stays usable while the map is generating.'
        ]
    },
    {
        at: '2026-08-20T19:39:45-04:00',
        title: 'Campaign and battles',
        items: [
            'Campaign battles field allied enemy countries, and the end screen shows those armies as teams.',
            'Large battles stay smoother at 3x speed.'
        ]
    }
];
