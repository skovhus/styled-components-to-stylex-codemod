import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-DQy262oc.js";var n=e(),r=t.span`
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
`,l=t.span`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: gray;
`,u=t.div`
  padding: 8px;

  &:hover ${l} {
    color: ${e=>e.$hoverColor??`blue`};
  }

  &:focus ${l} {
    color: ${e=>e.$focusColor??`green`};
  }
`,d=t.span`
  font-size: 14px;
`,f=t.div`
  display: flex;
  gap: 4px;

  &:hover ${d} {
    color: ${({$chipColor:e})=>e??`purple`};
  }
`,p=t.span`
  font-size: 14px;
`,m=t.div`
  padding: 8px;
  border: 1px solid #ccc;

  &:hover,
  &:focus-within {
    ${p} {
      color: ${e=>e.$tone??`darkgreen`};
    }
  }
`,h=t.div`
  position: sticky;
  top: 0;
`,g=t.div`
  overflow: auto;

  ${h} {
    min-width: ${e=>e.$minContentWidth}px;
  }
`,_=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,n.jsxs)(i,{$color:`blue`,children:[(0,n.jsx)(r,{}),`Button hover → Icon color`]}),(0,n.jsx)(o,{$shadow:`rgba(0,0,255,0.3)`,children:(0,n.jsx)(a,{children:`Card hover → Badge shadow`})}),(0,n.jsx)(c,{$accent:`red`,children:(0,n.jsx)(s,{children:`Toolbar hover → Tag border`})}),(0,n.jsx)(u,{$hoverColor:`red`,$focusColor:`orange`,children:(0,n.jsx)(l,{children:`Hover vs Focus`})}),(0,n.jsx)(f,{$chipColor:`teal`,children:(0,n.jsx)(d,{children:`Destructured prop`})}),(0,n.jsx)(m,{$tone:`seagreen`,children:(0,n.jsx)(`button`,{type:`button`,children:(0,n.jsx)(p,{children:`Grouped hover/focus dynamic color`})})}),(0,n.jsx)(g,{$minContentWidth:320,children:(0,n.jsx)(h,{children:`Dynamic descendant width`})})]});export{_ as App};