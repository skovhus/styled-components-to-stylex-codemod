import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-BpFzo4jj.js";var n=e(),r=t.span`
  position: relative;
  padding: 8px 16px;
  background-color: #f0f0f0;

  &::after {
    content: "";
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    top: 0;
    right: 0;
    background-color: ${e=>e.$badgeColor};
  }
`,i=t.div`
  position: relative;
  padding: 8px;

  &::before {
    content: "";
    display: block;
    height: 3px;
    background-color: ${e=>e.$tipColor||`black`};
  }
`,a=t.span`
  position: relative;
  padding: 4px 8px;
  background-color: #e0e0e0;

  &::after {
    content: "";
    display: block;
    height: 2px;
    background-color: ${e=>e.$tagColor};
  }
`,o=t.input`
  padding: 12px;
  border: 1px solid #ccc;
  background: white;

  &::placeholder {
    color: ${e=>e.theme.color.labelMuted};
  }
`,s=t.input`
  padding: 12px;
  border: 1px solid #ccc;

  &::placeholder {
    color: ${e=>e.theme.color[e.$placeholderColor]};
  }
`,c=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,gap:`16px`,padding:`16px`,width:560,flexWrap:`wrap`},children:[(0,n.jsx)(r,{$badgeColor:`red`,children:`Notification`}),(0,n.jsx)(r,{$badgeColor:`green`,children:`Online`}),(0,n.jsx)(r,{$badgeColor:`blue`,children:`Info`}),(0,n.jsx)(i,{$tipColor:`navy`,children:`With color`}),(0,n.jsx)(i,{children:`Default`}),(0,n.jsx)(a,{$tagColor:`tomato`,children:`With color`}),(0,n.jsx)(a,{children:`No color`}),(0,n.jsx)(o,{placeholder:`Muted placeholder`}),(0,n.jsx)(s,{$placeholderColor:`labelBase`,placeholder:`Base`}),(0,n.jsx)(s,{$placeholderColor:`labelMuted`,placeholder:`Muted`})]});export{c as App};