import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,u as n}from"./index-D50K3hv9.js";var r=e(),i=n.div(({$align:e})=>t`
    display: flex;
    gap: var(--spacing-xxs);
    overflow: hidden;
    white-space: nowrap;
    position: relative;
    justify-content: ${e===`left`?`flex-start`:`flex-end`};
  `),a=n.div(({$color:e})=>t`
    padding: 16px;
    background-color: ${e||`lightgray`};
    border-radius: 4px;
  `),o=n.div(e=>t`
    padding: 8px;
    border-width: 2px;
    border-style: solid;
    border-color: ${e.$borderColor||`black`};
    margin: 4px;
  `),s=n.div(e=>t`
    padding: 12px;
    box-shadow: ${e.$shadow||`none`};
  `),c=n.div(e=>t`
      display: block;
      width: ${e.$width||`100%`};
    `),l=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsxs)(i,{$align:`left`,children:[(0,r.jsx)(a,{$color:`lightblue`,children:`Left aligned`}),(0,r.jsx)(a,{$color:`lightgreen`,children:`Item`})]}),(0,r.jsx)(i,{$align:`right`,children:(0,r.jsx)(a,{children:`Right aligned`})}),(0,r.jsx)(o,{$borderColor:`red`,children:`Red border`}),(0,r.jsx)(s,{$shadow:`0 2px 4px rgba(0,0,0,0.2)`,children:`With shadow`}),(0,r.jsx)(c,{$width:`50%`,children:`Half width`})]});export{l as App};