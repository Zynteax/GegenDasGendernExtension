const devMode = true;
const FILTER_URL = "https://raw.githubusercontent.com/Zynteax/GegenDasGendernExtension/master/filter.json";
const CACHE_DURATION = 15 * 60 * 1000; // 15 Minuten
const GENDER_SYMBOLS = [":", "*", "_", "·", "/", "-"];

// Globale Zustände für den kompilierten Filter
let compiledRegex = null;
let filterMap = new Map();

/**
 * Erzeugt aus einer Basis-Filterliste automatisch alle Varianten.
 * @param {object} baseFilter - Das ursprüngliche Filterobjekt aus der JSON-Datei.
 * @returns {Map<string, string>} Eine Map mit allen originalen und generierten Filterregeln.
 */
function generateFilterVariants(baseFilter) {
    const variants = new Map();

    for (const [key, value] of Object.entries(baseFilter)) {
        variants.set(key, value);

        // Behandelt Präpositionen wie "zum:zur" -> "zum".
        // Diese Logik wurde präzisiert, um Fehler wie "in" -> "Trainer" zu vermeiden.
        const prepParts = key.split(':');
        if (prepParts.length === 2 && prepParts[0] === value && prepParts[1].length > 0 && prepParts[0].length <= 4) {
            variants.set(prepParts[1], value);
        }

        // Findet das verwendete Gender-Symbol im Schlüssel (z.B. ":")
        const originalSymbol = GENDER_SYMBOLS.find(sym => key.includes(sym));

        if (originalSymbol) {
            // Erzeugt Varianten mit anderen Symbolen (z.B. "*" und "_")
            GENDER_SYMBOLS.forEach(targetSymbol => {
                if (originalSymbol !== targetSymbol) {
                    const newKey = key.replace(new RegExp(escapeRegex(originalSymbol), 'g'), targetSymbol);
                    variants.set(newKey, value);
                }
            });

            // Erzeugt Binnen-I-Varianten (z.B. "ÄrztInnen" aus "Ärzt:innen")
            if (key.endsWith(`${originalSymbol}innen`)) {
                variants.set(key.replace(`${originalSymbol}innen`, 'Innen'), value);
            }
            if (key.endsWith(`${originalSymbol}in`)) {
                variants.set(key.replace(`${originalSymbol}in`, 'In'), value);
            }
        }
    }
    return variants;
}

/**
 * Maskiert Sonderzeichen in einem String für die Verwendung in einem regulären Ausdruck.
 * @param {string} str - Der zu maskierende String.
 * @returns {string} Der maskierte String.
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Kompiliert die Filter-Map in einen einzigen, effizienten regulären Ausdruck.
 * @param {Map<string, string>} variants - Die Map aller Filterregeln.
 */
function compileFilter(variants) {
    filterMap = variants;
    if (filterMap.size === 0) {
        compiledRegex = null;
        return;
    }

    // Sortiert die Schlüssel nach Länge (absteigend), um längere Muster zuerst zu finden.
    const sortedPatterns = Array.from(filterMap.keys()).sort((a, b) => b.length - a.length);
    const regexString = sortedPatterns.map(escapeRegex).join('|');

    // Verwendet negative Lookarounds, um ganze Wörter zu erkennen, auch wenn sie Symbole enthalten.
    compiledRegex = new RegExp(`(?<!\\w)(${regexString})(?!\\w)`, 'g');
}

/**
 * Ersetzt alle Gender-Begriffe in einem gegebenen Text.
 * @param {string} text - Der zu verarbeitende Text.
 * @returns {string} Der verarbeitete Text.
 */
function replaceGendersInText(text) {
    if (!compiledRegex || !text) return text;

    return text.replace(compiledRegex, (match) => {
        const replacement = filterMap.get(match);
        return replacement !== undefined ? replacement : match;
    });
}

/**
 * Durchläuft den DOM ab einem Startknoten und wendet die Ersetzungen auf alle Textknoten an.
 * @param {Node} rootNode - Der Startknoten für die Verarbeitung.
 */
function processNode(rootNode) {
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
            // Überspringt leere, bearbeitbare oder unsichtbare Knoten
            if (!parent || node.nodeValue.trim() === '' || parent.isContentEditable ||
                ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    const nodesToUpdate = [];
    while (walker.nextNode()) nodesToUpdate.push(walker.currentNode);

    for (const node of nodesToUpdate) {
        const originalText = node.nodeValue;
        const newText = replaceGendersInText(originalText);
        if (originalText !== newText) {
            node.nodeValue = newText;
        }
    }
}

/**
 * Debounce-Hilfsfunktion, um eine Funktion nicht zu häufig auszuführen.
 * @param {Function} func - Die zu debouncende Funktion.
 * @param {number} wait - Die Wartezeit in Millisekunden.
 * @returns {Function} Die debounced Funktion.
 */
function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const debouncedProcessBody = debounce(() => processNode(document.body), 150);

/**
 * Initialisiert den Filter: Lädt, generiert Varianten und kompiliert den Regex.
 */
async function initialize() {
    let baseFilter;
    try {
        const cachedFilter = localStorage.getItem('cachedFilter');
        const cacheTimestamp = localStorage.getItem('cacheTimestamp');
        if (!devMode && cachedFilter && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
            baseFilter = JSON.parse(cachedFilter);
        } else {
            const response = await fetch(FILTER_URL);
            if (!response.ok) throw new Error(`HTTP-Fehler: ${response.status}`);
            baseFilter = await response.json();
            localStorage.setItem('cachedFilter', JSON.stringify(baseFilter));
            localStorage.setItem('cacheTimestamp', Date.now().toString());
        }
    } catch (error) {
        console.error("GegenDasGendern: Filter konnte nicht geladen werden.", error);
        return;
    }

    const variants = generateFilterVariants(baseFilter);
    compileFilter(variants);
    if (devMode) {
        console.log(`GegenDasGendern: Filter mit ${variants.size} Varianten initialisiert.`);
    }
}

// --- Hauptausführung ---
(async function main() {
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }

    await initialize();
    processNode(document.body);

    const observer = new MutationObserver(() => debouncedProcessBody());
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
    });
})();