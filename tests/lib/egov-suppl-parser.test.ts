import { describe, expect, it } from 'vitest';
import { filterSupplProvisions, findSupplProvision, listSupplProvisions } from '../../src/lib/egov-parser.js';
import type { EgovLawData, EgovNode } from '../../src/lib/types.js';

const original: EgovNode = { tag: 'SupplProvision' };
const amendments = [
  '平成二八年三月三一日法律第五号',
  '平成二八年三月三一日法律第一五号',
  '平成二八年三月三一日法律第一一五号',
  '平成二年三月三一日法律第一五号',
  '令和元年三月三一日法律第二〇〇〇号',
].map((AmendLawNum) => ({ tag: 'SupplProvision', attr: { AmendLawNum } }));

const lawData: EgovLawData = {
  law_info: { law_id: '', law_type: '', law_num: '', promulgation_date: '' },
  law_full_text: {
    tag: 'Law',
    children: [{
      tag: 'LawBody',
      children: [{ tag: 'MainProvision' }, original, '\n', ...amendments],
    }],
  },
};
const infos = listSupplProvisions(lawData);

describe('改正法の法令番号で附則を照合する', () => {
  it.each([
    ['平成28年法律第5号', 0],
    ['平成28年法律第15号', 1],
    ['平成２８年法律第１５号', 1],
    ['平成二八年三月三一日法律第一五号', 1],
    ['平成二十八年法律第十五号', 1],
    ['平成28年法律第十五号', 1],
    ['平成二十八年法律第百十五号', 2],
    ['令和一年法律第二千号', 4],
  ] as const)('%s は該当する附則だけを返す', (query, index) => {
    expect(findSupplProvision(lawData, query)).toEqual({
      node: amendments[index],
      info: infos[index + 1],
    });
    expect(filterSupplProvisions(infos, query)).toEqual([infos[index + 1]]);
  });

  it('年・号それぞれの絞り込みと複数候補を扱う', () => {
    expect(filterSupplProvisions(infos, '平成二十八年')).toEqual(infos.slice(1, 4));
    expect(filterSupplProvisions(infos, '第十五号')).toEqual([infos[2], infos[4]]);
    expect(findSupplProvision(lawData, '第十五号')).toEqual({ ambiguous: [infos[2], infos[4]] });
  });

  it.each(['平成二十八年法律第万五号', '平成十十年法律第十五号', '平成28年法律第16号'])(
    '%s を別の番号として照合しない',
    (query) => {
      expect(filterSupplProvisions(infos, query)).toEqual([]);
      expect(findSupplProvision(lawData, query)).toBeNull();
    },
  );
});
