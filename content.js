const devMode = false;
const FILTER_URL = "https://raw.githubusercontent.com/Zynteax/GegenDasGendernExtension/master/filter.json";
const CACHE_DURATION = 30 * 60 * 1000;
const GENDER_SYMBOLS = [":", "*", "/", "·", "_", "-"];
let compiledFilter = [];

function matchCase(source, target) {
    if (source === source.toUpperCase()) return target.toUpperCase();
    if (source[0] === source[0].toUpperCase()) return target[0].toUpperCase() + target.slice(1);
    return target.toLowerCase();
}

async function fetchAndPrepareFilter() {
    const cached = localStorage.getItem("filterCache");
    const timestamp = localStorage.getItem("filterCacheTime");
    const now = Date.now();

    if(!devMode) {
        if (cached && timestamp && (now - parseInt(timestamp, 10)) < CACHE_DURATION) {
            return JSON.parse(cached);
        }
    }
    const response = await fetch(FILTER_URL);
    if (!response.ok) throw new Error("Fehler beim Laden des Filters");

    const baseFilter = await response.json();
    localStorage.setItem("filterCache", JSON.stringify(baseFilter));
    localStorage.setItem("filterCacheTime", now.toString());
    console.log("Filter erfolgreich geladen und im Cache gespeichert.");
    console.log("Filter-Inhalt:", baseFilter);
    return baseFilter;
}

function expandFilterVariants(base) {
    const expanded = {};

    for (const [key, value] of Object.entries(base)) {
        if (!key.includes(":")) {
            expanded[key] = value;
            continue;
        }

        for (const symbol of GENDER_SYMBOLS) {
            const variant = key.replace(/:/g, symbol);
            expanded[variant] = value;
        }
    }

    return expanded;
}

function compileFilter(filterMap) {
    compiledFilter = [];

    for (const [pattern, replacement] of Object.entries(filterMap)) {
        const escaped = pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(?<!\\w)${escaped}(?!\\w)`, "gi");
        compiledFilter.push({ regex, replacement });
    }
}

function applyCompiledFilter(text) {
    for (const { regex, replacement } of compiledFilter) {
        text = text.replace(regex, match => {
            const matchWords = match.split(/\s+/);
            const replWords = replacement.split(/\s+/);

            return replWords.map((rep, i) => {
                const mw = matchWords[i] || "";
                return matchCase(mw, rep);
            }).join(" ");
        });
    }
    return text;
}

function applyGenericGenderRegex(text) {
    return text
        .replace(/ern[:*_·/\-]innen/gi, "ern")
        .replace(/er[:*_·/\-]innen/gi, "er")
        .replace(/en[:*_·/\-]innen/gi, "en")
        .replace(/([a-zäöüß]+)[:*_·/\-]innen\b/gi, "$1en")
        .replace(/([a-zäöüß]+)[:*_·/\-]in\b/gi, "$1")
        .replace(/ende[:*_·/\-]r/gi, "er")
        .replace(/e[:*_·/\-]r/gi, "er")
        .replace(/(?<![a-z])([A-Za-zäöüÄÖÜß]+)Innen\b/g, "$1")
        .replace(/(?<![a-z])([A-Za-zäöüÄÖÜß]+)In\b/g, "$1");
}

function processNode(rootNode) {
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const parent = node.parentElement;
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
        const original = node.nodeValue;

        const filtered = applyCompiledFilter(original);

        const modified = (filtered === original)
            ? applyGenericGenderRegex(original)
            : filtered;

        if (original !== modified) {
            node.nodeValue = modified;
        }
    }
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const debouncedProcessBody = debounce(() => processNode(document.body), 150);

(async function main() {
    if (document.readyState === "loading") {
        await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve));
    }

    try {
        const base = await fetchAndPrepareFilter();
        const expanded = expandFilterVariants(base);
        compileFilter(expanded);
    } catch (e) {
        console.error("Filter konnte nicht geladen werden:", e);
    }

    processNode(document.body);

    const observer = new MutationObserver(() => debouncedProcessBody());
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
})();