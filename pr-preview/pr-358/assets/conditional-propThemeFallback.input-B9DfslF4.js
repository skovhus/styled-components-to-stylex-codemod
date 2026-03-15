import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-GfnpIRuu.js";var n=e(),r=t(`div`)`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;

  ${e=>e.hollow?`border: solid 1px ${e.color?e.color:e.theme.color.labelMuted}`:`background-color: ${e.color?e.color:e.theme.color.labelMuted}`};

  ${e=>e.size===`tiny`&&`
    width: 7px;
    height: 7px;
  `};

  ${e=>e.size===`small`&&`
    width: 9px;
    height: 9px;
  `};
`,i=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(r,{}),(0,n.jsx)(r,{color:`hotpink`}),(0,n.jsx)(r,{hollow:!0}),(0,n.jsx)(r,{hollow:!0,color:`hotpink`}),(0,n.jsx)(r,{size:`tiny`}),(0,n.jsx)(r,{size:`small`}),(0,n.jsx)(r,{color:`#ff0000`})]});export{i as App,r as ColorBadge};