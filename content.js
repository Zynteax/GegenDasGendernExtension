let filter = {};

const symbols = [":", "*", "_", "·", "/"];

async function fetchFilter(url) {
    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) throw new Error("Filter konnte nicht geladen werden");
    console.log(text);
    return JSON.parse(text);
}

async function initFilter() {
    const base = await fetchFilter("https://raw.githubusercontent.com/Zynteax/GegenDasGendernExtension/master/filter.json");
    const result = { ...base };

    for (const [key, value] of Object.entries(base)) {
        if (key.includes(":innen")) {
            result[key.replace(":innen", ":in")] = value;
        }

        if (key.includes(":")) {
            for (const symbol of symbols) {
                result[key.replace(":", symbol)] = value;

                if (key.includes(":innen")) {
                    result[key.replace(":innen", symbol + "in")] = value;
                }
            }
        }
    }

    return result;
}

function ersetzeGendern(text) {
    if (!filter || Object.keys(filter).length === 0) return text;

    for (const [pattern, replacement] of Object.entries(filter)) {
        const escaped = pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        text = text.replace(regex, (match) => {
            if (match === match.toUpperCase()) return replacement.toUpperCase();
            if (match[0] === match[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
            return replacement.toLowerCase();
        });
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

    while (walker.nextNode()) {
        const node = walker.currentNode;
        const updated = ersetzeGendern(node.nodeValue);
        if (node.nodeValue !== updated) node.nodeValue = updated;
    }
}

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

function genderEntfernenInSelects(node) {
    if (isSelectOpen) return;

    node.querySelectorAll('select')?.forEach(select => {
        const initial = select.getAttribute('data-initial-value');
        if (initial) {
            const updated = ersetzeGendern(initial);
            if (updated !== initial) {
                select.setAttribute('data-initial-value', updated);
            }
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
}, 300);

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
console.log("DEBUG 1");
(async () => {
    console.log("DEBUG 2");
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', async () => {
            console.log("DEBUG 3");
            await start();
        });
    } else {
        console.log("DEBUG 4");
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
