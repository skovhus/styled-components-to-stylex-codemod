import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-CXk9jAM4.js";t();var r=e(),i=n.div`
  background: ${e=>e.theme.color.bgSub};
  width: 100px;
  height: 100px;
`,a=n.a`
  &:focus-visible ${i} {
    outline: 10px solid ${e=>e.theme.color.labelBase};
    outline-offset: 5px;
  }
`,o=n.div`
  width: 50px;
  height: 50px;
  background: white;
`,s=n.div`
  &:hover ${o} {
    box-shadow: 0 4px 8px ${e=>e.theme.color.labelBase};
  }
`,c=n.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  background: currentColor;
  mask-size: contain;
  border-radius: 50%;
`,l=n.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #BF4F74;
  color: white;
  border: none;
  border-radius: 4px;

  ${c} {
    width: 20px;
    height: 20px;
    opacity: 0.8;
  }

  &:hover ${c} {
    opacity: 1;
    transform: scale(1.1);
  }
`,u=n.span`
  display: inline-block;
  width: 12px;
  height: 12px;
  background: currentColor;
  border-radius: 999px;
`,d=n.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #f5f5f5;
  color: #333;

  ${u} {
    transform: scale(0.75);
    opacity: 0;
  }

  &:hover,
  &:focus-within {
    color: #111;

    ${u} {
      opacity: 1;
    }
  }
`,f=n.a`
  color: #2563eb;
`,p=n.div`
  ${f} {
    display: flex;
  }
`,m=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsxs)(l,{children:[`Click me`,(0,r.jsx)(c,{})]}),(0,r.jsx)(`br`,{}),(0,r.jsx)(`br`,{}),(0,r.jsx)(a,{href:`#`,children:(0,r.jsx)(i,{})}),(0,r.jsx)(`br`,{}),(0,r.jsx)(`br`,{}),(0,r.jsx)(s,{children:(0,r.jsx)(o,{})}),(0,r.jsx)(`br`,{}),(0,r.jsx)(`br`,{}),(0,r.jsxs)(d,{tabIndex:0,children:[`Grouped parent pseudos`,(0,r.jsx)(u,{})]}),(0,r.jsx)(`br`,{}),(0,r.jsx)(`br`,{}),(0,r.jsx)(p,{children:(0,r.jsx)(f,{href:`#`,children:`Nested link`})})]});export{m as App,a as ContainerLink};