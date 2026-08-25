from pathlib import Path

path = Path('game.js')
s = path.read_text()

replacements = [
    (
        "ctx.font=`${Math.round(10*scale)}px system-ui`;ctx.textAlign='center';ctx.fillStyle=t.secondary;ctx.fillText('TAP',x,y-r-12*scale)",
        ""
    ),
    (
        "ctx.font=`${Math.round(10*scale)}px system-ui`;ctx.textAlign='center';ctx.fillStyle=t.danger;ctx.fillText('HOLD',x,upper-48)",
        ""
    ),
    (
        "ctx.font=`${Math.round(10*scale)}px system-ui`;ctx.textAlign='center';ctx.fillStyle='#fff';ctx.fillText('WAIT',x,y-38*scale)",
        ""
    ),
    (
        "ui.phrase.textContent=`${next.phrase} · ${next.step+1}/${next.length} · ${next.type==='none'?'OPEN':next.type.toUpperCase()}`;",
        "ui.phrase.textContent=next.phrase;"
    ),
]

changed = False
for old, new in replacements:
    if old in s:
        s = s.replace(old, new, 1)
        changed = True
    elif new and new in s:
        continue
    elif not new and old not in s:
        # Canvas labels may already have been removed.
        continue
    else:
        raise SystemExit('Expected action-flash block not found; refusing to patch unknown game.js')

path.write_text(s)
print('Distracting TAP/HOLD/WAIT flashes removed' if changed else 'Action flashes already removed')
