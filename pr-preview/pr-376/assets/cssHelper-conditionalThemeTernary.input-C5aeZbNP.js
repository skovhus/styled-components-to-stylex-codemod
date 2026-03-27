import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r,u as i}from"./index-BUV05faP.js";e(t(),1);var a=n(),o=r.div`
  display: flex;
  ${e=>e.$isDisabled&&i`
      color: ${e.theme.isDark?`#ffffff55`:`#FFFFFF`};
    `}
  ${e=>e.$isInactive?i`
          background-color: ${e.theme.color.bgBorderSolid};
        `:``};
  ${e=>e.$isInvite?i`
          background-color: ${e.theme.color.bgBase};
        `:``};
`,s=r.div`
  padding: 8px;
  ${e=>e.highlighted&&i`
      border-width: ${e.theme.isDark?2:1}px;
      border-style: solid;
      border-color: ${e.theme.color.bgBorderSolid};
    `}
`,c=()=>(0,a.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,a.jsx)(o,{$fontSize:14,$isDisabled:!0,children:`Disabled`}),(0,a.jsx)(o,{$fontSize:14,$isInactive:!0,children:`Inactive`}),(0,a.jsx)(o,{$fontSize:14,$isInvite:!0,children:`Invite`}),(0,a.jsx)(o,{$fontSize:14,children:`Default`}),(0,a.jsx)(s,{highlighted:!0,children:`Highlighted`}),(0,a.jsx)(s,{children:`Normal`})]});export{c as App};