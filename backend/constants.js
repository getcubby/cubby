export default {
    TEST: process.env.CUBBY_ENV === 'test',
    CLOUDRON: !!process.env.CLOUDRON,
};
