import{d as c,j as t}from"./index-DQGQMgP1.js";var o=(e=>(e.active="active",e.inactive="inactive",e))(o||{});const n=c.svg.attrs({className:"color-override"})`
  ${e=>e.$color?`fill: ${e.$color};`:""};
`,r=c(i)`
  ${e=>e.noDate&&!e.selected&&e.status==="active"?`
    transform: scale(0.66);
  `:""}
`;function i(e){const{selected:a,noDate:l,...s}=e;return t.jsx("svg",{...s,children:t.jsx("circle",{cx:"50",cy:"50",r:"40",stroke:"green",strokeWidth:"4"})})}function u(){return t.jsxs("div",{children:[t.jsx(n,{$color:"red",children:t.jsx("circle",{cx:"50",cy:"50",r:"40",stroke:"green",strokeWidth:"4"})}),t.jsx(r,{noDate:!0,selected:!0,status:"active"}),t.jsx(r,{noDate:!0,selected:!0,status:"inactive"}),t.jsx(r,{noDate:!0,status:"active"})]})}export{u as App,n as IconWithTeamColor,r as IconWithTransform,o as Status};
