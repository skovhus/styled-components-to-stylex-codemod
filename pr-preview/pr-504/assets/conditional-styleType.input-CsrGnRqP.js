import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-DN9jWtl0.js";n();var r=e(),i=function(e){return e.active=`active`,e.inactive=`inactive`,e}({}),a=t.svg.attrs({className:`color-override`})`
  ${e=>e.$color?`fill: ${e.$color};`:``};
`,o=t(s)`
  ${e=>e.noDate&&!e.selected&&e.status===i.active?`
    transform: scale(0.66);
  `:``}
`;function s(e){let{selected:t,noDate:n,...i}=e;return(0,r.jsx)(`svg`,{...i,children:(0,r.jsx)(`circle`,{cx:`50`,cy:`50`,r:`40`,stroke:`green`,strokeWidth:`4`})})}function c(){return(0,r.jsxs)(`div`,{children:[(0,r.jsx)(a,{$color:`red`,children:(0,r.jsx)(`circle`,{cx:`50`,cy:`50`,r:`40`,stroke:`green`,strokeWidth:`4`})}),(0,r.jsx)(o,{noDate:!0,selected:!0,status:i.active}),(0,r.jsx)(o,{noDate:!0,selected:!0,status:i.inactive}),(0,r.jsx)(o,{noDate:!0,status:i.active})]})}export{c as App,a as IconWithTeamColor,o as IconWithTransform,i as Status};