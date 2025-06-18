const symbols = [":", "*", "_", "·", "/"];

function initFilter() {
    const base = "";

    const result = { ...base };

    for (const [key, value] of Object.entries(base)) {
        if (key.includes(":innen")) {
            const singularKey = key.replace(":innen", ":in");
            result[singularKey] = value;
        }

        if (key.includes(":")) {
            for (const symbol of symbols) {
                const altKey = key.replace(":", symbol);
                result[altKey] = value;

                if (key.includes(":innen")) {
                    const singularAltKey = key.replace(":innen", symbol + "in");
                    result[singularAltKey] = value;
                }
            }
        }
    }

    return result;
}

const filter = initFilter();

function ersetzeGendern(text) {
    for (const [pattern, replacement] of Object.entries(filter)) {
        const escaped = pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        text = text.replace(regex, (match) => {
            if (match === match.toUpperCase()) {
                return replacement.toUpperCase();
            } else if (match[0] === match[0].toUpperCase()) {
                return replacement[0].toUpperCase() + replacement.slice(1);
            } else {
                return replacement.toLowerCase();
            }
        });
    }

    return text.replace(/([A-Za-zäöüÄÖÜß]+?)I(nnen|n)(\b|(?=\p{L}))/gu, (match, stamm) => {
        if (match === match.toUpperCase()) {
            return stamm.toUpperCase();
        } else if (match[0] === match[0].toUpperCase()) {
            return stamm[0].toUpperCase() + stamm.slice(1);
        } else {
            return stamm.toLowerCase();
        }
    });
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
    node.querySelectorAll?.('select')?.forEach(select => {
        const initial = select.getAttribute('data-initial-value');
        if (initial) {
            const updated = ersetzeGendern(initial);
            if (updated !== initial) {
                select.setAttribute('data-initial-value', updated);
            }
        }

        select.querySelectorAll('option').forEach(option => {
            const originalText = option.textContent;
            const updatedText = ersetzeGendern(originalText);
            if (updatedText !== originalText) {
                option.textContent = updatedText;
            }
        });
    });
}

function genderEntfernen(node) {
    const walker = document.createTreeWalker(
        node,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function (textNode) {
                const parent = textNode.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const style = window.getComputedStyle(parent);
                return style && style.visibility !== 'hidden' && style.display !== 'none'
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
            }
        },
        false
    );

    while (walker.nextNode()) {
        const currentNode = walker.currentNode;
        const original = currentNode.nodeValue;
        const updated = ersetzeGendern(original);
        if (updated !== original) {
            currentNode.nodeValue = updated;
        }
    }
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
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

const observer = new MutationObserver((mutations) => {
    let needsUpdate = false;

    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && node.closest && node.closest('select')) {
                continue;
            }
            needsUpdate = true;
        }

        if (
            mutation.type === "characterData" &&
            mutation.target.parentElement?.closest('select')
        ) {
            continue;
        }

        if (mutation.type === "characterData") {
            needsUpdate = true;
        }
    }

    if (needsUpdate) {
        safeProcessMutations();
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
});

// Initialausführung
genderEntfernen(document.body);
genderEntfernenInSelects(document.body);
