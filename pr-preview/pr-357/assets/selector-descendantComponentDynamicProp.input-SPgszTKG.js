import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-CyUUxAP6.js";var n=e(),r=t.span`
  width: 16px;
  height: 16px;
`,i=t.button`
  padding: 8px;

  &:hover ${r} {
    color: ${e=>e.$color??`red`};
  }
`,a=t.span`
  font-size: 12px;
`,o=t.div`
  padding: 16px;
  background: white;

  &:hover ${a} {
    box-shadow: 0 4px 8px ${e=>e.$shadow??`rgba(0,0,0,0.2)`};
  }
`,s=t.span`
  display: inline-block;
`,c=t.div`
  display: flex;
  gap: 8px;

  &:hover ${s} {
    border: 2px solid ${e=>e.$accent??`gray`};
  }
`,l=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,n.jsxs)(i,{$color:`blue`,children:[(0,n.jsx)(r,{}),`Button hover → Icon color`]}),(0,n.jsx)(o,{$shadow:`rgba(0,0,255,0.3)`,children:(0,n.jsx)(a,{children:`Card hover → Badge shadow`})}),(0,n.jsx)(c,{$accent:`red`,children:(0,n.jsx)(s,{children:`Toolbar hover → Tag border`})})]});export{l as App};