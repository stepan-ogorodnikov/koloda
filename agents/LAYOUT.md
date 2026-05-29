# Layout System

Narrow and wide layouts. Single breakpoint `--breakpoint-wd` defined in `global.css` 

## Narrow layout (`< wd`)

### Route with main content

- **Nav**: in the drawer.
- **Sidebar**: in the drawer.
- **Content**: inline, takes the whole viewport width.
- **Drawer**: fixed overlay sliding from the left.
- **Sidebar controls**: toggles drawer open/close.

### Route without main content

- **Nav**: inline, not collapsible.
- **Sidebar**: inline, takes the remaining width of the viewport.
- **Content**: hidden since it's empty.
- **Drawer**: not needed, content is rendered inline.
- **Sidebar controls**: disabled.

## Wide layout (`>= wd`)

- **Nav**: inline, collapsible.
- **Sidebar**: inline.
- **Content**: inline, fills remaining width, can be empty.
- **Drawer**: not needed, all zones fit in the viewport.
- **Sidebar controls**: toggles nav collapsible state.
