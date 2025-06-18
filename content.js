let filter = {};
let compiledFilter = [];
const devMode = true;
const GENDER_SYMBOLS = [":", "*", "_", "·", "/"];
const FILTER_URL = "https://raw.githubusercontent.com/Zynteax/GegenDasGendernExtension/master/filter.json";

function generateFilterVariants(base) {
    const result = { ...base };
    const seen = new Set(Object.keys(base));

    for (const [key, value] of Object.entries(base)) {
        if (key.includes(":innen")) {
            const variant = key.replace(":innen", ":in");
            if (!seen.has(variant)) {
                result[variant] = value;
                seen.add(variant);
            }
        }
        if (key.includes(":")) {
            for (const symbol of GENDER_SYMBOLS) {
                const variant = key.replace(":", symbol);
                if (!seen.has(variant)) {
                    result[variant] = value;
                    seen.add(variant);
                }
                if (key.includes(":innen")) {
                    const innerVariant = key.replace(":innen", symbol + "in");
                    if (!seen.has(innerVariant)) {
                        result[innerVariant] = value;
                        seen.add(innerVariant);
                    }
                }
            }
        }
    }
    return result;
}

function compileFilter(filterObj) {
    compiledFilter = [];
    for (const [pattern, replacement] of Object.entries(filterObj)) {
        const regexPattern = pattern.replace(/[:*_·/]/, '[:*_·/]');
        try {
            const regex = new RegExp(regexPattern, 'gi');
            compiledFilter.push({ regex, replacement });
        } catch {
        }
    }
}

async function fetchAndCacheFilter(url) {
    const cachedFilter = localStorage.getItem('cachedFilter');
    const cacheTimestamp = localStorage.getItem('cacheTimestamp');
    const cacheDuration = 30 * 60 * 1000;

    if (!devMode && cachedFilter && cacheTimestamp && (Date.now() - cacheTimestamp < cacheDuration)) {
        return JSON.parse(cachedFilter);
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error("Filter konnte nicht geladen werden");
    const filterData = await response.json();

    localStorage.setItem('cachedFilter', JSON.stringify(filterData));
    localStorage.setItem('cacheTimestamp', Date.now().toString());

    return filterData;
}

async function initFilter() {
    const base = await fetchAndCacheFilter(FILTER_URL);
    const variants = generateFilterVariants(base);
    compileFilter(variants);
    return variants;
}

function ersetzeGendern(text) {
    if (!compiledFilter.length) return text;

    for (const { regex, replacement } of compiledFilter) {
        text = text.replace(regex, match => {
            if (match === match.toUpperCase()) return replacement.toUpperCase();
            if (match[0] === match[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
            return replacement.toLowerCase();
        });
    }

    const praepositionen = [
        "mit", "von", "bei", "für", "an", "zu", "nach", "aus", "unter", "zwischen",
        "über", "gegen", "ohne", "durch", "um", "bis", "ab", "seit"
    ];
    const berufe = [
        ...new Set(Object.values(filter)
            .filter(w => /^[A-ZÄÖÜ][a-zäöüß]+$/.test(w))
            .filter(w => /(er|ant|ent|ist|or|eur|loge|graf|nom|at|us|e|en|n)$/.test(w))
        )
    ];
    for (const beruf of berufe) {
        let plural = beruf;
        if (beruf.endsWith("er")) plural += "n";
        else if (beruf.endsWith("ant") || beruf.endsWith("ent") || beruf.endsWith("ist")) plural += "en";
        else if (beruf.endsWith("or")) plural = beruf.slice(0, -2) + "oren";
        else if (beruf.endsWith("e")) plural += "n";
        else if (beruf.endsWith("n")) plural = beruf;
        else plural += "en";

        const regex1 = new RegExp(
            `\\b(?:${praepositionen.join("|")})\\s+\\d{1,3}(?:\\.\\d{3})*\\s+${beruf}\\b`, "gi"
        );
        text = text.replace(regex1, match => match.replace(new RegExp(`${beruf}\\b`, "i"), plural));

        const regex2 = new RegExp(
            `\\b\\d{1,3}(?:\\.\\d{3})*\\s+[A-Za-zäöüÄÖÜß]+\\s+von\\s+${beruf}\\b`, "gi"
        );
        text = text.replace(regex2, match => match.replace(new RegExp(`${beruf}\\b`, "i"), plural));
    }

    return text.replace(/([A-Za-zäöüÄÖÜß]+?)I(nnen|n)(\b|(?=\p{L}))/gu, (_, stamm) => {
        if (stamm === stamm.toUpperCase()) return stamm.toUpperCase();
        if (stamm[0] === stamm[0].toUpperCase()) return stamm[0].toUpperCase() + stamm.slice(1);
        return stamm.toLowerCase();
    });
}

function genderEntfernen(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
        acceptNode(textNode) {
            const parent = textNode.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const style = window.getComputedStyle(parent);
            return style?.visibility !== 'hidden' && style?.display !== 'none'
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        }
    });

    const updates = [];
    while (walker.nextNode()) {
        const node = walker.currentNode;
        const updated = ersetzeGendern(node.nodeValue);
        if (node.nodeValue !== updated) {
            updates.push({ node, updated });
        }
    }

    for (const { node, updated } of updates) {
        node.nodeValue = updated;
    }
}

function genderEntfernenInSelects(node) {
    if (isSelectOpen) return;
    node.querySelectorAll('select')?.forEach(select => {
        const initial = select.getAttribute('data-initial-value');
        if (initial) {
            const updated = ersetzeGendern(initial);
            if (updated !== initial) select.setAttribute('data-initial-value', updated);
        }
        select.querySelectorAll('option')?.forEach(option => {
            const original = option.textContent;
            const updated = ersetzeGendern(original);
            if (updated !== original) option.textContent = updated;
        });
    });
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const safeProcessMutations = debounce(() => {
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => genderEntfernen(document.body));
    } else {
        setTimeout(() => genderEntfernen(document.body), 100);
    }
}, 200);

const observer = new MutationObserver(mutations => {
    let needsUpdate = false;
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && node.closest?.('select')) continue;
            needsUpdate = true;
        }
        if (mutation.type === "characterData" && !mutation.target.parentElement?.closest('select')) {
            needsUpdate = true;
        }
    }
    if (needsUpdate) safeProcessMutations();
});

let isSelectOpen = false;
document.addEventListener('focusin', e => {
    if (e.target.tagName === 'SELECT') isSelectOpen = true;
});
document.addEventListener('focusout', e => {
    if (e.target.tagName === 'SELECT') {
        isSelectOpen = false;
        setTimeout(() => genderEntfernenInSelects(document.body), 200);
    }
});

(async function main() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        await start();
    }

    async function start() {
        try {
            filter = await initFilter();
            console.log("Filter geladen", filter);
        } catch (e) {
            console.error("Fehler beim Laden des Filters:", e);
            return;
        }
        genderEntfernen(document.body);
        genderEntfernenInSelects(document.body);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }
})();