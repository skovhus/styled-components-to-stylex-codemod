import{j as r,a as d,b as i}from"./index-CbA7q58U.js";const l=d.div(({$align:o})=>i`
    display: flex;
    gap: var(--spacing-xxs);
    overflow: hidden;
    white-space: nowrap;
    position: relative;
    justify-content: ${o==="left"?"flex-start":"flex-end"};
  `),e=d.div(({$color:o})=>i`
    padding: 16px;
    background-color: ${o||"lightgray"};
    border-radius: 4px;
  `),n=d.div(o=>i`
    padding: 8px;
    border-width: 2px;
    border-style: solid;
    border-color: ${o.$borderColor||"black"};
    margin: 4px;
  `),t=d.div(o=>i`
    padding: 12px;
    box-shadow: ${o.$shadow||"none"};
  `),s=d.div(o=>i`
      display: block;
      width: ${o.$width||"100%"};
    `),x=()=>r.jsxs("div",{children:[r.jsxs(l,{$align:"left",children:[r.jsx(e,{$color:"lightblue",children:"Left aligned"}),r.jsx(e,{$color:"lightgreen",children:"Item"})]}),r.jsx(l,{$align:"right",children:r.jsx(e,{children:"Right aligned"})}),r.jsx(n,{$borderColor:"red",children:"Red border"}),r.jsx(t,{$shadow:"0 2px 4px rgba(0,0,0,0.2)",children:"With shadow"}),r.jsx(s,{$width:"50%",children:"Half width"})]});export{x as App};
