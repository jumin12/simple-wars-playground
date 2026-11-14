// Audio helpers used by the engine.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodStartMenuMusic() {
    if(!window.wodMusic) return;
    try {
        window.wodMusic.bindUi();
        window.wodMusic.unlockFromGesture();
        window.wodMusic.start();
    } catch(e) { console.warn(e); }
}
function wodPlayUnitSelectionSound(items) {
    if(gameState!=='PLAYING'||gameData.menuAttractMode||!UI.escMenu.classList.contains('hidden'))return;
    let own=(items||[]).filter(u=>u&&u.uid&&u.owner===wodLocalPlayerOwner()&&u.hp>0&&['light','motorized','mountaineer','marine','heavy','ship','transport','supply'].includes(u.type));
    if(own.length)window.wodBattleAudio?.selectUnits(wodGetMatchPeriod(),own);
}
function wodPlayUnitMoveSound(items) {
    if(gameState!=='PLAYING'||gameData.menuAttractMode||!UI.escMenu.classList.contains('hidden'))return;
    let own=(items||[]).filter(u=>u&&u.uid&&u.owner===wodLocalPlayerOwner()&&u.hp>0&&['light','motorized','mountaineer','marine','heavy','ship','transport','supply'].includes(u.type));
    if(own.length)window.wodBattleAudio?.moveUnits(wodGetMatchPeriod(),own);
}
