import"./chunk-zsgVPwQN.js";import{t as e}from"./react-D4cBbUL-.js";import{f as t,s as n,u as r}from"./index-DmJsELTa.js";e();var i=t(),a=n.div`
  display: flex;
  ${e=>e.$isDisabled&&r`
      color: ${e.theme.isDark?`#ffffff55`:`#FFFFFF`};
    `}
  ${e=>e.$isInactive?r`
          background-color: ${e.theme.color.bgBorderSolid};
        `:``};
  ${e=>e.$isInvite?r`
          background-color: ${e.theme.color.bgBase};
        `:``};
`,o=n.div`
  padding: 8px;
  ${e=>e.highlighted&&r`
      border-width: ${e.theme.isDark?2:1}px;
      border-style: solid;
      border-color: ${e.theme.color.bgBorderSolid};
    `}
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(a,{$fontSize:14,$isDisabled:!0,children:`Disabled`}),(0,i.jsx)(a,{$fontSize:14,$isInactive:!0,children:`Inactive`}),(0,i.jsx)(a,{$fontSize:14,$isInvite:!0,children:`Invite`}),(0,i.jsx)(a,{$fontSize:14,children:`Default`}),(0,i.jsx)(o,{highlighted:!0,children:`Highlighted`}),(0,i.jsx)(o,{children:`Normal`})]});export{s as App};