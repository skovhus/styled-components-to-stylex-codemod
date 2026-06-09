import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-CdtNEIDC.js";import{l as r}from"./helpers-DBeghnsW.js";/* empty css                          */n();var i=e(),a=t.button`
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-primary);
  color: white;
  border: 2px solid var(--color-secondary);
  border-radius: var(--border-radius);

  &:hover {
    background: var(--color-secondary);
  }
`,o=t.div`
  padding: var(--spacing-lg);
  border: 1px solid var(--color-secondary, #ccc);
  border-radius: var(--border-radius);
  margin: var(--spacing-md);
`,s=t.p`
  color: var(--text-color, #333);
  font-size: var(--font-size, 16px);
  line-height: var(--line-height, 1.5);
`,c=t.span`
  color: var(--color-primary, "tomato");
  background: ${e=>`var(--color-secondary, ${e.$tone})`};
  outline: 2px solid ${e=>`var(--color-secondary)`};
`,l=t.div`
  --agent-item-min-width: 100%;
`,u=t.div`
  --agent-item-min-width: 75%;
`,d=t.div`
  @media (min-width: 600px) {
    --agent-item-min-width: 75%;
  }
  &:hover {
    --agent-item-min-width: 80%;
  }
`,f=t.div`
  --agent-item-min-width: 100%;
  ${e=>e.$wide&&`--agent-item-min-width: 75%;`}
`,p=t.div`
  --agent-item-min-width: 50%;
  ${r}
`,m=()=>(0,i.jsxs)(o,{children:[(0,i.jsx)(s,{children:`Some text content`}),(0,i.jsx)(a,{children:`Click me`}),(0,i.jsx)(c,{$tone:`papayawhip`,children:`Tagged`}),(0,i.jsx)(l,{children:(0,i.jsx)(c,{$tone:`mistyrose`,children:`Wide tagged`})}),(0,i.jsx)(l,{children:(0,i.jsx)(a,{children:`Wide button`})}),(0,i.jsx)(u,{children:(0,i.jsx)(a,{children:`Single-use wide button`})}),(0,i.jsx)(d,{children:(0,i.jsx)(a,{children:`Conditional wide button`})}),(0,i.jsx)(f,{$wide:!0,children:(0,i.jsx)(a,{children:`Variant wide button`})}),(0,i.jsx)(p,{children:(0,i.jsx)(a,{children:`External vars wide button`})})]});export{m as App};