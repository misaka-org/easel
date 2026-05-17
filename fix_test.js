const fs = require("fs");
const p = "src/runtime/__tests__/keybindings.test.ts";
let c = fs.readFileSync(p, "utf-8");
const old = "  it('register returns an unregister function', () => {\n    const kb = new KeybindingManager();\n    const handler = vi.fn();\n    kb.register({ id: 'test', key: 'a', handler });\n    expect(kb.dispatch(mockKey('a'), false)).toBe(false);\n  });";
const replacement = "  it('register returns an unregister function', () => {\n    const kb = new KeybindingManager();\n    const handler = vi.fn();\n    const unreg = kb.register({ id: 'test', key: 'a', handler });\n    unreg();\n    expect(kb.dispatch(mockKey('a'), false)).toBe(false);\n  });";
c = c.replace(old, replacement);
fs.writeFileSync(p, c, "utf-8");
console.log("OK");
