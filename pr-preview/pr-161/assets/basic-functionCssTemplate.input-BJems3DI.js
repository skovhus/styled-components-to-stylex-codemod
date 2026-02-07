import{j as o,d as r,l as i}from"./index-CNtKh6BA.js";const l=r.div(({$align:d})=>i`
    display: flex;
    gap: var(--spacing-xxs);
    overflow: hidden;
    white-space: nowrap;
    position: relative;
    justify-content: ${d==="left"?"flex-start":"flex-end"};
  `),e=r.div(({$color:d})=>i`
    padding: 16px;
    background-color: ${d||"lightgray"};
    border-radius: 4px;
  `),n=r.div(d=>i`
    padding: 8px;
    border-width: 2px;
    border-style: solid;
    border-color: ${d.$borderColor||"black"};
    margin: 4px;
  `),t=r.div(d=>i`
    padding: 12px;
    box-shadow: ${d.$shadow||"none"};
  `),s=r.div(d=>i`
      display: block;
      width: ${d.$width||"100%"};
    `),x=()=>o.jsxs("div",{children:[o.jsxs(l,{$align:"left",children:[o.jsx(e,{$color:"lightblue",children:"Left aligned"}),o.jsx(e,{$color:"lightgreen",children:"Item"})]}),o.jsx(l,{$align:"right",children:o.jsx(e,{children:"Right aligned"})}),o.jsx(n,{$borderColor:"red",children:"Red border"}),o.jsx(t,{$shadow:"0 2px 4px rgba(0,0,0,0.2)",children:"With shadow"}),o.jsx(s,{$width:"50%",children:"Half width"})]});export{x as App};
