/** Public product identifiers and prices. No payment credentials belong here. */
(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.WodStoreCatalog = catalog;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PRICE_MULTIPLIER = 5;
  const products = Object.freeze({
    supporter: { itemId: 100, name: 'Supporter Pack', usdCents: 1000, gold: 5000, supporter: true },
    gold1000: { itemId: 101, name: '1,000 Gold', usdCents: 100, gold: 1000 },
    gold6000: { itemId: 102, name: '6,000 Gold', usdCents: 500, gold: 6000 },
    gold15000: { itemId: 103, name: '15,000 Gold', usdCents: 1000, gold: 15000 },
  });
  const ancient = Object.freeze({
    civRome: ['civRome', 'civRome2'], civCarthage: ['civCarthage', 'civCarthage2'],
    civEgypt: ['civEgypt', 'civEgypt2'], civMacedon: ['civMacedon', 'civMacedon2'],
    civSparta: ['civSparta', 'civSparta2'], civGaul: ['civGaul'],
  });
  const sections = Object.freeze({
    standard: ['napoleonic', 'medieval', 'ancient', 'atlasUnits'],
    ancientCiv: Object.keys(ancient),
    countryballs: ['usa', 'uk', 'germany', 'france', 'japan', 'ussr', 'italy', 'china'],
    ruse: ['ruseUsa', 'ruseUk', 'ruseFrance', 'ruseGermany', 'ruseUssr', 'ruseJapan', 'ruseItaly', 'ruseChina'],
  });
  const skins = Object.values(sections).flat();
  const visuals = ['map_atlas_hd', ...['dotted', 'double', 'dashed', 'dashdot', 'thick', 'glow'].map(x => 'viz_frontline_' + x),
    ...['dotted', 'line', 'dashed', 'chevron', 'bold', 'rail'].map(x => 'viz_arrow_' + x),
    ...['gold', 'white', 'red', 'blue'].map(x => 'viz_color_' + x)];
  const price = base => Math.max(0, Math.floor(Number(base) || 0)) * PRICE_MULTIPLIER;
  const skinCost = id => price(ancient[id] && id !== 'civGaul' ? 200 : 100);
  const premiumBase = id => /^(supporterGold|goldenChip)(?:_(ancient|medieval|napoleonic))?$/.exec(String(id || ''))?.[1] || '';
  const premiumPeriod = id => /_(ancient|medieval|napoleonic)$/.exec(String(id || ''))?.[1] || 'modern';
  const premiumVariants = base => [base, ...['napoleonic','medieval','ancient'].map(period => base + '_' + period)];
  const achievementIds = ['brokenShield','townTaker','tankHunter','depthCharge','merchantMarine','industrial','admiralty','fortunesOfWar','grandHost','warmaster','firstLanding','missionChain','fullDeployment','ashenVictory','regionalCommander','periodNapoleonic','periodAncient','periodMedieval'];
  function shopItems(request, missionManifest) {
    const req = request || {}, id = String(req.itemId || '');
    if (req.kind === 'skin' && skins.includes(id)) return [{ kind: 'skin', id, price: skinCost(id), grants: ancient[id] || [id] }];
    if (req.kind === 'skin_bulk' && Object.hasOwn(sections, req.section)) return sections[req.section].map(id => ({ kind: 'skin', id, price: skinCost(id), grants: ancient[id] || [id] }));
    if (req.kind === 'visual' && visuals.includes(id)) return [{ kind: 'visual', id, price: price(100), grants: [id] }];
    if (req.kind === 'map') {
      const key = id.replace(/^shop_map_/, '');
      const entry = [...(missionManifest?.maps || []), ...(missionManifest?.missions || [])].find(e => e.id === key);
      if (entry) return [{ kind: 'visual', id: 'shop_map_' + key, price: price(entry.price || 150), grants: ['shop_map_' + key] }];
    }
    throw new Error('Unknown shop item');
  }
  return Object.freeze({ version: 2, PRICE_MULTIPLIER, products, ancient, sections, skins, visuals, price, skinCost, shopItems, premiumBase, premiumPeriod, premiumVariants, achievementIds });
});
