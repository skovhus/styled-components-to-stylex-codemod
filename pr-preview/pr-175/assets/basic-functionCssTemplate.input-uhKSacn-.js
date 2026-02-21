import{j as d,c as r,s as i}from"./index-DHeQ_gfE.js";const l=r.div(({$align:o})=>i`
    display: flex;
    gap: var(--spacing-xxs);
    overflow: hidden;
    white-space: nowrap;
    position: relative;
    justify-content: ${o==="left"?"flex-start":"flex-end"};
  `),e=r.div(({$color:o})=>i`
    padding: 16px;
    background-color: ${o||"lightgray"};
    border-radius: 4px;
  `),s=r.div(o=>i`
    padding: 8px;
    border-width: 2px;
    border-style: solid;
    border-color: ${o.$borderColor||"black"};
    margin: 4px;
  `),n=r.div(o=>i`
    padding: 12px;
    box-shadow: ${o.$shadow||"none"};
  `),t=r.div(o=>i`
      display: block;
      width: ${o.$width||"100%"};
    `),x=()=>d.jsxs("div",{children:[d.jsxs(l,{$align:"left",children:[d.jsx(e,{$color:"lightblue",children:"Left aligned"}),d.jsx(e,{$color:"lightgreen",children:"Item"})]}),d.jsx(l,{$align:"right",children:d.jsx(e,{children:"Right aligned"})}),d.jsx(s,{$borderColor:"red",children:"Red border"}),d.jsx(n,{$shadow:"0 2px 4px rgba(0,0,0,0.2)",children:"With shadow"}),d.jsx(t,{$width:"50%",children:"Half width"})]});export{x as App};
