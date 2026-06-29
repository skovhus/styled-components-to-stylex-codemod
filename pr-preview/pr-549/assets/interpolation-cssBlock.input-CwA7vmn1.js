import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,m as n,u as r}from"./index-BHFfZhDz.js";n();var i=e(),a=r.button`
  padding: 8px 16px;
  border-radius: 4px;

  ${e=>e.$primary?t`
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
          background: ${e.theme.color.bgBase};
          color: black;
        `}
`;function o(){return(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{children:`Normal`}),(0,i.jsx)(a,{$primary:!0,children:`Primary`})]})}export{o as App,a as Button};