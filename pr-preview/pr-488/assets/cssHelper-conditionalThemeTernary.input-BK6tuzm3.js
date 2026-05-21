import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,d as n,p as r}from"./index-EYvCkOpW.js";r();var i=e(),a=t.div`
  display: flex;
  ${e=>e.$isDisabled&&n`
      color: ${e.theme.isDark?`#ffffff55`:`#FFFFFF`};
    `}
  ${e=>e.$isInactive?n`
          background-color: ${e.theme.color.bgBorderSolid};
        `:``};
  ${e=>e.$isInvite?n`
          background-color: ${e.theme.color.bgBase};
        `:``};
`,o=t.div`
  padding: 8px;
  ${e=>e.highlighted&&n`
      border-width: ${e.theme.isDark?2:1}px;
      border-style: solid;
      border-color: ${e.theme.color.bgBorderSolid};
    `}
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(a,{$fontSize:14,$isDisabled:!0,children:`Disabled`}),(0,i.jsx)(a,{$fontSize:14,$isInactive:!0,children:`Inactive`}),(0,i.jsx)(a,{$fontSize:14,$isInvite:!0,children:`Invite`}),(0,i.jsx)(a,{$fontSize:14,children:`Default`}),(0,i.jsx)(o,{highlighted:!0,children:`Highlighted`}),(0,i.jsx)(o,{children:`Normal`})]});export{s as App};