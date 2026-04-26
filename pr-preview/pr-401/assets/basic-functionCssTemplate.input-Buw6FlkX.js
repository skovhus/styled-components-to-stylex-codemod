import{c as e,f as t,u as n}from"./index-BPaLyyRP.js";var r=t(),i=n.div(({$align:t})=>e`
    display: flex;
    gap: var(--spacing-xxs);
    overflow: hidden;
    white-space: nowrap;
    position: relative;
    justify-content: ${t===`left`?`flex-start`:`flex-end`};
  `),a=n.div(({$color:t})=>e`
    padding: 16px;
    background-color: ${t||`lightgray`};
    border-radius: 4px;
  `),o=n.div(t=>e`
    padding: 8px;
    border-width: 2px;
    border-style: solid;
    border-color: ${t.$borderColor||`black`};
    margin: 4px;
  `),s=n.div(t=>e`
    padding: 12px;
    box-shadow: ${t.$shadow||`none`};
  `),c=n.div(t=>e`
      display: block;
      width: ${t.$width||`100%`};
    `),l=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsxs)(i,{$align:`left`,children:[(0,r.jsx)(a,{$color:`lightblue`,children:`Left aligned`}),(0,r.jsx)(a,{$color:`lightgreen`,children:`Item`})]}),(0,r.jsx)(i,{$align:`right`,children:(0,r.jsx)(a,{children:`Right aligned`})}),(0,r.jsx)(o,{$borderColor:`red`,children:`Red border`}),(0,r.jsx)(s,{$shadow:`0 2px 4px rgba(0,0,0,0.2)`,children:`With shadow`}),(0,r.jsx)(c,{$width:`50%`,children:`Half width`})]});export{l as App};