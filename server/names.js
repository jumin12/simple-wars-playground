'use strict';
// Clan and player names compared the way people read them. Two names are the same name when they differ only in case,
// spacing, punctuation, accents, invisible characters (a zero-width space) or letters from another alphabet that look
// like ours (a Cyrillic "е" in "Dev"): "The Dev Clan", "the  dev-clan" and "Thе Dеv Clаn" are one name. The oldest
// holder keeps a name; a younger one with the same name is shown as NAME_TAKEN_PLACEHOLDER until it picks a new one,
// and nobody may take the placeholder itself.
const NAME_TAKEN_PLACEHOLDER = 'thanks for noticing';

// Letters from other alphabets that look like Latin ones (upper and lower case).
const LOOKALIKES = {
    'А': 'a', 'В': 'b', 'Е': 'e', 'Ё': 'e', 'К': 'k', 'М': 'm', 'Н': 'h', 'О': 'o', 'Р': 'p', 'С': 'c', 'Т': 't', 'У': 'y', 'Х': 'x', 'І': 'i', 'Ї': 'i', 'Ј': 'j', 'Ѕ': 's', 'Ԁ': 'd', 'Ԛ': 'q', 'Ԝ': 'w', 'Ү': 'y', 'Һ': 'h', 'Ӏ': 'l',
    'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ї': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ԛ': 'q', 'ԝ': 'w', 'ү': 'y', 'һ': 'h', 'ӏ': 'l',
    'Α': 'a', 'Β': 'b', 'Ε': 'e', 'Ζ': 'z', 'Η': 'h', 'Ι': 'i', 'Κ': 'k', 'Μ': 'm', 'Ν': 'n', 'Ο': 'o', 'Ρ': 'p', 'Τ': 't', 'Υ': 'y', 'Χ': 'x',
    'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ω': 'w',
};

/** A name with invisible formatting characters (zero-width spaces, joiners, direction marks) taken out. */
function stripInvisible(raw) {
    return String(raw == null ? '' : raw).replace(/\p{Cf}/gu, '');
}
/** The key two names share when people would read them as the same name. */
function nameMatchKey(raw) {
    // (compatibility forms such as full-width letters become plain ones; accents and invisible marks go)
    const plain = stripInvisible(raw).normalize('NFKD').replace(/\p{M}/gu, '');
    let s = '';
    for(const ch of plain) s += LOOKALIKES[ch] || ch;
    s = s.toLowerCase();
    const compact = s.replace(/[^\p{L}\p{N}]/gu, '');
    // (a name of nothing but symbols keeps them, so "!!!" and "???" stay different names)
    return compact || s.replace(/\s+/g, ' ').trim();
}
const PLACEHOLDER_KEY = nameMatchKey(NAME_TAKEN_PLACEHOLDER);
/** Whether a name reads as the placeholder that marks a name already taken. */
function isPlaceholderName(raw) { return nameMatchKey(raw) === PLACEHOLDER_KEY; }

module.exports = { NAME_TAKEN_PLACEHOLDER, stripInvisible, nameMatchKey, isPlaceholderName };
