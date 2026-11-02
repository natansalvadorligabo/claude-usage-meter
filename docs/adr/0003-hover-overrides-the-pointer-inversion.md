# The footer's hover turns off the Button's inversion with `inverse: false`, and sets no background

Under the pointer, a plain `Button` draws its label inverted. The footer turns that off by giving every hover style `inverse: false`, and leaves `backgroundColor` unset so the terminal's own background shows on every theme (#7).

That works because of the order inside the engine's `Button` (Claude Code 2.1.316, minified):

```js
let { overrides: v } = At(Ot(plugin, hover), hover, "Box")   // the hover style, active while the group is lit
let C = M.focused || M.hovered || b                           // pointer or keyboard focus
plain ? Text({ inverse: C, dimColor: U, ...v }, ...)          // v is spread after inverse, so it wins
```

The `.d.ts` still says "under the pointer itself the button inverts as it always has", which describes a Button with no hover, not this order. If an engine update flips the order, the inversion comes back, and no test catches it: `claude plugin test` checks the tree handed to the surface, never what the terminal paints. After any change to hover styles, or a Claude Code upgrade, run `scripts/hover-check.sh`.

## Considered Options

- **A fixed background (`#0c0c0c`, Windows Terminal Campbell):** removed. It sat in the same override as `inverse: false`, so it never suppressed anything, and it painted a black block on every other theme.
- **Read the terminal's background from the mods API:** not possible. The theme key `background` is an accent color, and `"transparent"` is accepted only for a pane's `ui.open` background.
