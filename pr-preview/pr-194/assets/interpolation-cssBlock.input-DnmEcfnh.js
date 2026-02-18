import{j as r,b as t,a}from"./index-BbDQu6W7.js";const n=a.button`
  padding: 8px 16px;
  border-radius: 4px;

  ${o=>o.$primary?t`
          background: blue;
          color: white;

          &:after {
            content: "";
            position: absolute;
            inset: 0 4px;
            background-color: hotpink;
            z-index: -1;
            border-radius: 6px;
          }
        `:t`
          background: ${o.theme.color.bgBase};
          color: black;
        `}
`;function i(){return r.jsxs("div",{children:[r.jsx(n,{children:"Normal"}),r.jsx(n,{$primary:!0,children:"Primary"})]})}export{i as App,n as Button};
