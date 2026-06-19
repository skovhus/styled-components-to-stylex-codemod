import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-xibBjGTp.js";import{l as r}from"./helpers-Bj1BJgsF.js";/* empty css                          */t();var i=e(),a=n.button`
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-primary);
  color: white;
  border: 2px solid var(--color-secondary);
  border-radius: var(--border-radius);

  &:hover {
    background: var(--color-secondary);
  }
`,o=n.div`
  padding: var(--spacing-lg);
  border: 1px solid var(--color-secondary, #ccc);
  border-radius: var(--border-radius);
  margin: var(--spacing-md);
`,s=n.p`
  color: var(--text-color, #333);
  font-size: var(--font-size, 16px);
  line-height: var(--line-height, 1.5);
`,c=n.span`
  color: var(--color-primary, "tomato");
  background: ${e=>`var(--color-secondary, ${e.$tone})`};
  outline: 2px solid ${e=>`var(--color-secondary)`};
`,l=n.div`
  --agent-item-min-width: 100%;
`,u=n.div`
  --agent-item-min-width: 75%;
`,d=n.div`
  @media (min-width: 600px) {
    --agent-item-min-width: 75%;
  }
  &:hover {
    --agent-item-min-width: 80%;
  }
`,f=n.div`
  --agent-item-min-width: 100%;
  ${e=>e.$wide&&`--agent-item-min-width: 75%;`}
`,p=n.div`
  --agent-item-min-width: 50%;
  ${r}
`,m=()=>(0,i.jsxs)(o,{children:[(0,i.jsx)(s,{children:`Some text content`}),(0,i.jsx)(a,{children:`Click me`}),(0,i.jsx)(c,{$tone:`papayawhip`,children:`Tagged`}),(0,i.jsx)(l,{children:(0,i.jsx)(c,{$tone:`mistyrose`,children:`Wide tagged`})}),(0,i.jsx)(l,{children:(0,i.jsx)(a,{children:`Wide button`})}),(0,i.jsx)(u,{children:(0,i.jsx)(a,{children:`Single-use wide button`})}),(0,i.jsx)(d,{children:(0,i.jsx)(a,{children:`Conditional wide button`})}),(0,i.jsx)(f,{$wide:!0,children:(0,i.jsx)(a,{children:`Variant wide button`})}),(0,i.jsx)(p,{children:(0,i.jsx)(a,{children:`External vars wide button`})})]});export{m as App};