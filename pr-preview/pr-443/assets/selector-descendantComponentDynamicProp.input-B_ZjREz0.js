import{c as e,p as t}from"./index-Vlep2TLl.js";var n=t(),r=e.span`
  width: 16px;
  height: 16px;
`,i=e.button`
  padding: 8px;

  &:hover ${r} {
    color: ${e=>e.$color??`red`};
  }
`,a=e.span`
  font-size: 12px;
`,o=e.div`
  padding: 16px;
  background: white;

  &:hover ${a} {
    box-shadow: 0 4px 8px ${e=>e.$shadow??`rgba(0,0,0,0.2)`};
  }
`,s=e.span`
  display: inline-block;
`,c=e.div`
  display: flex;
  gap: 8px;

  &:hover ${s} {
    border: 2px solid ${e=>e.$accent??`gray`};
  }
`,l=e.span`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: gray;
`,u=e.div`
  padding: 8px;

  &:hover ${l} {
    color: ${e=>e.$hoverColor??`blue`};
  }

  &:focus ${l} {
    color: ${e=>e.$focusColor??`green`};
  }
`,d=e.span`
  font-size: 14px;
`,f=e.div`
  display: flex;
  gap: 4px;

  &:hover ${d} {
    color: ${({$chipColor:e})=>e??`purple`};
  }
`,p=e.span`
  font-size: 14px;
`,m=e.div`
  padding: 8px;
  border: 1px solid #ccc;

  &:hover,
  &:focus-within {
    ${p} {
      color: ${e=>e.$tone??`darkgreen`};
    }
  }
`,h=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,n.jsxs)(i,{$color:`blue`,children:[(0,n.jsx)(r,{}),`Button hover → Icon color`]}),(0,n.jsx)(o,{$shadow:`rgba(0,0,255,0.3)`,children:(0,n.jsx)(a,{children:`Card hover → Badge shadow`})}),(0,n.jsx)(c,{$accent:`red`,children:(0,n.jsx)(s,{children:`Toolbar hover → Tag border`})}),(0,n.jsx)(u,{$hoverColor:`red`,$focusColor:`orange`,children:(0,n.jsx)(l,{children:`Hover vs Focus`})}),(0,n.jsx)(f,{$chipColor:`teal`,children:(0,n.jsx)(d,{children:`Destructured prop`})}),(0,n.jsx)(m,{$tone:`seagreen`,children:(0,n.jsx)(`button`,{type:`button`,children:(0,n.jsx)(p,{children:`Grouped hover/focus dynamic color`})})})]});export{h as App};