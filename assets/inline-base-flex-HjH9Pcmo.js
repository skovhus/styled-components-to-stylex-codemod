import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{s as n,u as r}from"./index-Dda2rlA_.js";e(t(),1);var i={start:`flex-start`,center:`center`,end:`flex-end`,stretch:`stretch`},a=n.div`
  display: flex;
  ${({column:e,direction:t})=>e?r`
          flex-direction: column;
        `:t?r`
            flex-direction: ${t};
          `:``}
  ${({gap:e})=>e===void 0?``:r`
          gap: ${e}px;
        `}
  ${({align:e})=>e?r`
          align-items: ${i[e]};
        `:``}
  ${({justify:e})=>e?r`
          justify-content: ${e};
        `:``}
  ${({center:e})=>e?r`
          align-items: center;
          justify-content: center;
        `:``}
`;export{a as t};