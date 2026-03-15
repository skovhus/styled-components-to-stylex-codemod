import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-DRa1uduC.js";e(t(),1);var i=n(),a=function(e){return e.active=`active`,e.inactive=`inactive`,e}({}),o=r.svg.attrs({className:`color-override`})`
  ${e=>e.$color?`fill: ${e.$color};`:``};
`,s=r(c)`
  ${e=>e.noDate&&!e.selected&&e.status===a.active?`
    transform: scale(0.66);
  `:``}
`;function c(e){let{selected:t,noDate:n,...r}=e;return(0,i.jsx)(`svg`,{...r,children:(0,i.jsx)(`circle`,{cx:`50`,cy:`50`,r:`40`,stroke:`green`,strokeWidth:`4`})})}function l(){return(0,i.jsxs)(`div`,{children:[(0,i.jsx)(o,{$color:`red`,children:(0,i.jsx)(`circle`,{cx:`50`,cy:`50`,r:`40`,stroke:`green`,strokeWidth:`4`})}),(0,i.jsx)(s,{noDate:!0,selected:!0,status:a.active}),(0,i.jsx)(s,{noDate:!0,selected:!0,status:a.inactive}),(0,i.jsx)(s,{noDate:!0,status:a.active})]})}export{l as App,o as IconWithTeamColor,s as IconWithTransform,a as Status};