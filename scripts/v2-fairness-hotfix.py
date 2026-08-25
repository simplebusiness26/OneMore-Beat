from pathlib import Path

path = Path('game.js')
s = path.read_text()

replacements = [
    (
        "state.pending.push({ beat:state.beatIndex, beatAt, resolveAt:beatAt+inputGraceMs(), desc });",
        "state.pending.push({ beat:state.beatIndex, beatAt, resolveAt:beatAt+inputGraceMs(), desc, heldAtBeat:state.held, holdStartedAt:state.held?state.pressStarted:null });",
    ),
    (
        """    } else if (desc.type === 'charge') {\n      if (!rec?.downAt) ok = false;\n      else {\n        const up = rec.upAt ?? now; const overlap = rec.downAt <= beatAt+good && up >= beatAt-55; const heldFor = up-rec.downAt;\n        ok = overlap && heldFor >= clamp(state.beatMs*.13,55,80); err = Math.abs(rec.downAt-beatAt);\n        quality = err <= perfect && up >= beatAt+30 ? 'perfect' : err >= good*.72 ? 'near' : 'good';\n      }\n    } else if (desc.type === 'rest') {\n      const restTouch = rec?.downAt ? Math.abs(rec.downAt-beatAt) <= good : false;\n      ok = !restTouch; quality = ok ? 'perfect' : 'miss';\n    }\n""",
        """    } else if (desc.type === 'charge') {\n      if (rec?.downAt) {\n        const up = rec.upAt ?? now; const overlap = rec.downAt <= beatAt+good && up >= beatAt-55; const heldFor = up-rec.downAt;\n        ok = overlap && heldFor >= clamp(state.beatMs*.13,55,80); err = Math.abs(rec.downAt-beatAt);\n        quality = err <= perfect && up >= beatAt+30 ? 'perfect' : err >= good*.72 ? 'near' : 'good';\n      } else if (p.heldAtBeat && p.holdStartedAt) {\n        ok = true; err = Math.abs(p.holdStartedAt-beatAt); quality = err <= perfect ? 'perfect' : 'good';\n      } else ok = false;\n    } else if (desc.type === 'rest') {\n      const restTouch = p.heldAtBeat || (rec?.downAt ? Math.abs(rec.downAt-beatAt) <= good : false);\n      ok = !restTouch; quality = ok ? 'perfect' : 'miss';\n    }\n""",
    ),
    (
        "state.performance=clamp(state.performance+.035,0,1); state.perfectStreak++; state.runPerfects++; progress.perfectTotal++;\n      state.runMaxPerfectStreak=Math.max(state.runMaxPerfectStreak,state.perfectStreak); progress.maxPerfectStreak=Math.max(progress.maxPerfectStreak,state.runMaxPerfectStreak);",
        "state.performance=clamp(state.performance+.035,0,1); state.perfectStreak++; state.runPerfects++;\n      state.runMaxPerfectStreak=Math.max(state.runMaxPerfectStreak,state.perfectStreak);\n      if(state.runMode!=='practice'){progress.perfectTotal++;progress.maxPerfectStreak=Math.max(progress.maxPerfectStreak,state.runMaxPerfectStreak);}",
    ),
    (
        "if (state.runMode === 'endless' && !state.choiceActive && !state.doubleMode && state.beatIndex >= 64 && state.beatIndex-state.lastChoiceBeat >= 96 && state.beatIndex%32===0) startChoice(beatAt);",
        "if (state.runMode === 'endless' && !state.choiceActive && !state.doubleMode && !bossInfoForBeat(state.beatIndex) && !bossInfoForBeat(state.beatIndex+1) && state.beatIndex >= 64 && state.beatIndex-state.lastChoiceBeat >= 96 && state.beatIndex%32===0) startChoice(beatAt);",
    ),
]

changed = False
for old, new in replacements:
    if old in s:
        s = s.replace(old, new, 1)
        changed = True
    elif new not in s:
        raise SystemExit('Expected V2 timing block not found; refusing to patch an unknown game.js')

path.write_text(s)
print('V2 fairness hotfix applied' if changed else 'V2 fairness hotfix already present')
