/**
 * Convert a glob (supporting **, *, ?) to a RegExp for matching paths.
 * Consecutive `**\/` segments are collapsed into a single non-capturing group
 * so the result cannot backtrack catastrophically: stacked `(.*\/)?` groups on
 * adjacent text are exponential, one `(?:.*\/)?` is linear.
 */
export function globToRegex(glob) {
    let core = '';
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === '*' && glob[i + 1] === '*' && glob[i + 2] === '/') {
            core += '(?:.*/)?';
            i += 2; // consume the first `**/`
            while (glob[i + 1] === '*' && glob[i + 2] === '*' && glob[i + 3] === '/')
                i += 3;
            continue;
        }
        if (c === '*' && glob[i + 1] === '*') {
            core += '.*';
            i += 1;
            continue;
        }
        if (c === '*') {
            core += '[^/]*';
            continue;
        }
        if (c === '?') {
            core += '[^/]';
            continue;
        }
        if ('.+^${}()|[]\\'.includes(c)) {
            core += '\\' + c;
            continue;
        }
        core += c;
    }
    const anchorFull = glob.startsWith('/') || glob.startsWith('**/');
    const pattern = anchorFull ? `^${core}$` : `(^|/)${core}$`;
    return new RegExp(pattern);
}
export function matchesRule(rule, input) {
    if (rule.appliesTo.tools && !rule.appliesTo.tools.includes(input.tool)) {
        return false;
    }
    if (input.event === 'content') {
        if (rule.appliesTo.pathGlob) {
            if (!input.path)
                return false;
            const matched = rule.appliesTo.pathGlob.some((g) => globToRegex(g).test(input.path));
            if (!matched)
                return false;
        }
    }
    else if (input.event === 'command') {
        if (rule.appliesTo.commandMatch) {
            if (!input.command)
                return false;
            const cmd = input.command.toLowerCase();
            const matched = rule.appliesTo.commandMatch.some((s) => cmd.includes(s.toLowerCase()));
            if (!matched)
                return false;
        }
    }
    return true;
}
