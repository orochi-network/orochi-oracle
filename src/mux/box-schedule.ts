import { IRequestData } from '../framework/interfaces';
import { Mux, Validator } from '../framework';
import { ValidatorPagination } from '../validators';
import ModelOpenSchedule from '../model/model-open-schedule';

Mux.get(
  '/api/v1/boxSchedule',
  new Validator(
    {
      name: 'status',
      type: 'number',
      location: 'query',
    },
    {
      name: 'owner',
      type: 'string',
      validator: (e): boolean => /^0x[0-9a-f]{40,40}$/gi.test(e),
      location: 'query',
    },
  ).merge(ValidatorPagination),
  async (req: IRequestData) => {
    const imOpenSchedule = new ModelOpenSchedule();
    const conditions = [];
    const {
      query: { status, owner },
    } = req;
    if (typeof status === 'number' && Number.isInteger(status)) {
      conditions.push({
        field: 'status',
        value: status,
      });
    }
    if (typeof owner === 'string') {
      conditions.push({
        field: 'owner',
        value: owner,
      });
    }
    return imOpenSchedule.getScheduling(req.query, <any>conditions);
  },
);