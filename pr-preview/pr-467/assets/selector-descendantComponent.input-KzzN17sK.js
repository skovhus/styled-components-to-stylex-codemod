import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-C7HhjyIG.js";n();var r=e(),i=t.div`
  background: ${e=>e.theme.color.bgSub};
  width: 100px;
  height: 100px;
`,a=t.a`
  &:focus-visible ${i} {
    outline: 10px solid ${e=>e.theme.color.labelBase};
    outline-offset: 5px;
  }
`,o=t.div`
  width: 50px;
  height: 50px;
  background: white;
`,s=t.div`
  &:hover ${o} {
    box-shadow: 0 4px 8px ${e=>e.theme.color.labelBase};
  }
`,c=t.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  background: currentColor;
  mask-size: contain;
  border-radius: 50%;
`,l=t.button`
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
`,u=t.span`
  display: inline-block;
  width: 12px;
  height: 12px;
  background: currentColor;
  border-radius: 999px;
`,d=t.div`
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
`,f=t.a`
  color: #2563eb;
`,p=t.div`
  ${f} {
    display: flex;
  }
`,m=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsxs)(l,{children:[`Click me`,(0,r.jsx)(c,{})]}),(0,r.jsx)(`br`,{}),(0,r.jsx)(`br`,{}),(0,r.jsx)(a,{href:`#`,children:(0,r.jsx)(i,{})}),(0,r.jsx)(`br`,{}),(0,r.jsx)(`br`,{}),(0,r.jsx)(s,{children:(0,r.jsx)(o,{})}),(0,r.jsx)(`br`,{}),(0,r.jsx)(`br`,{}),(0,r.jsxs)(d,{tabIndex:0,children:[`Grouped parent pseudos`,(0,r.jsx)(u,{})]}),(0,r.jsx)(`br`,{}),(0,r.jsx)(`br`,{}),(0,r.jsx)(p,{children:(0,r.jsx)(f,{href:`#`,children:`Nested link`})})]});export{m as App,a as ContainerLink};